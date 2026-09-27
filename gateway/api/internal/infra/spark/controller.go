package spark

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/infra/power"
)

const (
	sampleInterval   = 2 * time.Second
	offObservation   = 60 * time.Second
	shutdownDeadline = 10 * time.Minute
	startupDeadline  = 5 * time.Minute
)

type Operation struct {
	ID         string     `json:"id"`
	RequestID  string     `json:"request_id"`
	Action     string     `json:"action"`
	Status     string     `json:"status"`
	Phase      string     `json:"phase"`
	Message    string     `json:"message"`
	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
	actor      string
}

type Snapshot struct {
	Device        string     `json:"device"`
	RelayState    *string    `json:"relay_state"`
	MachineStatus string     `json:"machine_status"`
	ReceivedAt    *time.Time `json:"received_at"`
	power.Measurements
	Operation          *Operation `json:"operation"`
	CanPowerOn         bool       `json:"can_power_on"`
	CanShutdown        bool       `json:"can_shutdown"`
	ConfigurationError *string    `json:"configuration_error"`
	Error              *string    `json:"error"`
}

type Controller struct {
	ctx        context.Context
	config     Config
	host       *sparkHost
	setupError string
	mu         sync.Mutex
	operation  *Operation
	requests   map[string]*Operation
	reading    *meterReading
	machine    string
	readError  string
	// One session owns this device at a time, including the full shutdown sequence.
	slot chan struct{}
}

func New(ctx context.Context, cfg Config) *Controller {
	host, err := newHost(cfg)
	c := &Controller{ctx: ctx, config: cfg, host: host, requests: make(map[string]*Operation), machine: "unknown", slot: make(chan struct{}, 1)}
	problems := []string{cfg.MeterError, cfg.ControlError}
	if err != nil {
		problems = append(problems, "Spark setup: "+err.Error()+".")
	}
	for _, p := range problems {
		if p != "" {
			if c.setupError != "" {
				c.setupError += " "
			}
			c.setupError += p
		}
	}
	return c
}

func (c *Controller) snapshotLocked() Snapshot {
	s := Snapshot{Device: "dgx-spark-sg", MachineStatus: c.machine}
	if c.reading != nil && time.Since(c.reading.ReceivedAt) <= 8*time.Second {
		r := *c.reading
		s.RelayState, s.ReceivedAt, s.Measurements = &r.RelayState, &r.ReceivedAt, r.Measurements
	} else {
		s.MachineStatus = "unknown"
	}
	busy := c.operation != nil && c.operation.Status == "running"
	if c.operation != nil {
		op := *c.operation
		s.Operation = &op
	}
	problem := strings.TrimSpace(c.setupError + " " + c.config.ShutdownError)
	if problem != "" {
		s.ConfigurationError = &problem
	}
	if c.readError != "" {
		msg := c.readError
		s.Error = &msg
	}
	s.CanPowerOn = !busy && c.setupError == "" && s.RelayState != nil && *s.RelayState == "OFF"
	s.CanShutdown = !busy && c.setupError == "" && c.config.ShutdownError == "" && s.RelayState != nil && *s.RelayState == "ON" && s.MachineStatus == "online"
	return s
}

func (c *Controller) snapshot() Snapshot { c.mu.Lock(); defer c.mu.Unlock(); return c.snapshotLocked() }
func (c *Controller) busy() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.operation != nil && c.operation.Status == "running"
}
func (c *Controller) setReading(r meterReading) {
	c.mu.Lock()
	c.reading = &r
	c.readError = ""
	c.mu.Unlock()
}
func (c *Controller) setMachine(state string) { c.mu.Lock(); c.machine = state; c.mu.Unlock() }
func (c *Controller) unavailable(message string) {
	c.mu.Lock()
	c.reading = nil
	c.machine = "unknown"
	c.readError = message
	c.mu.Unlock()
}

// Idle views request new readings. An active operation supplies its own live samples;
// browser polling can neither consume its MQTT responses nor delay safety checks.
func (c *Controller) Read(parent context.Context) Snapshot {
	if c.busy() {
		return c.snapshot()
	}
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	select {
	case c.slot <- struct{}{}:
		defer func() { <-c.slot }()
	case <-ctx.Done():
		return c.snapshot()
	}
	if c.busy() {
		return c.snapshot()
	}
	if c.config.MeterError != "" {
		c.unavailable(c.config.MeterError)
		return c.snapshot()
	}
	// SSH and meter checks are independent and share the overall request deadline.
	hostResult := make(chan bool, 1)
	go func() {
		online := false
		if c.host != nil {
			_, err := c.host.status(ctx)
			online = err == nil
		}
		hostResult <- online
	}()
	session, err := connectMeter(ctx, c.config.Meter)
	if err != nil {
		c.unavailable("Could not read the Spark plug. Retrying…")
		return c.snapshot()
	}
	defer session.close()
	r, err := session.read(ctx)
	if err != nil {
		c.unavailable("Could not read the Spark plug. Retrying…")
		return c.snapshot()
	}
	c.setReading(r)
	select {
	case online := <-hostResult:
		if online {
			c.setMachine("online")
		} else if c.host != nil {
			c.setMachine("unreachable")
		} else {
			c.setMachine("unknown")
		}
	case <-ctx.Done():
		c.setMachine("unknown")
	}
	return c.snapshot()
}

// Start is process-local and serialized. Operations never resume after a restart.
func (c *Controller) Start(action, requestID, actor string) (Operation, int, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	key := actor + ":" + strings.ToLower(requestID)
	if previous := c.requests[key]; previous != nil {
		if previous.Action != action {
			return Operation{}, 409, "This request ID was used for a different action."
		}
		return *previous, 202, ""
	}
	if c.ctx.Err() != nil {
		return Operation{}, 503, "The gateway is shutting down."
	}
	if c.operation != nil && c.operation.Status == "running" {
		return Operation{}, 409, "A Spark power operation is already running."
	}
	if c.setupError != "" {
		return Operation{}, 503, c.setupError
	}
	if action == "shutdown" && c.config.ShutdownError != "" {
		return Operation{}, 503, c.config.ShutdownError
	}
	for k, op := range c.requests {
		if op.Status != "running" && time.Since(op.StartedAt) > 24*time.Hour {
			delete(c.requests, k)
		}
	}
	if len(c.requests) >= 1024 {
		return Operation{}, 429, "Too many power requests. Try again later."
	}
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return Operation{}, 503, "Could not start a power operation."
	}
	op := &Operation{ID: hex.EncodeToString(id[:]), RequestID: requestID, Action: action, Status: "running", Phase: "checking", Message: "Checking the Spark and its plug…", StartedAt: time.Now().UTC(), actor: actor}
	c.requests[key], c.operation = op, op
	// Copy before launching; the worker mutates this record under c.mu.
	response := *op
	slog.Info("spark_power_operation", "actor_id", actor, "operation_id", op.ID, "action", action, "result", "accepted")
	go c.run(op)
	return response, 202, ""
}

func (c *Controller) phase(op *Operation, phase, message string) {
	c.mu.Lock()
	op.Phase = phase
	op.Message = message
	c.mu.Unlock()
}
func (c *Controller) finish(op *Operation, status, message string) {
	c.mu.Lock()
	now := time.Now().UTC()
	op.Status = status
	op.Phase = status
	op.Message = message
	op.FinishedAt = &now
	c.mu.Unlock()
	slog.Info("spark_power_operation", "actor_id", op.actor, "operation_id", op.ID, "action", op.Action, "result", status, "message", message)
}

func (c *Controller) run(op *Operation) {
	limit := startupDeadline
	if op.Action == "shutdown" {
		limit = shutdownDeadline
	}
	ctx, cancel := context.WithTimeout(c.ctx, limit)
	defer cancel()
	select {
	case c.slot <- struct{}{}:
		defer func() { <-c.slot }()
	case <-ctx.Done():
		c.finish(op, "failed", "The operation timed out before starting. No relay command was sent.")
		return
	}
	s, err := connectMeter(ctx, c.config.Meter)
	if err != nil {
		c.unavailable("Spark plug unavailable.")
		c.finish(op, "failed", "Could not connect to the plug. No relay command was sent.")
		return
	}
	defer s.close()
	r, err := s.read(ctx)
	if err != nil {
		c.unavailable("Spark plug unavailable.")
		c.finish(op, "failed", "Could not read the plug. No relay command was sent.")
		return
	}
	c.setReading(r)
	if op.Action == "on" {
		c.powerOn(ctx, s, op, r)
		return
	}
	c.powerOff(ctx, s, op, r)
}

func pause(ctx context.Context, lost <-chan struct{}) error {
	timer := time.NewTimer(sampleInterval)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-lost:
		return errMeter
	}
}

func (c *Controller) powerOn(ctx context.Context, s *meterSession, op *Operation, r meterReading) {
	if r.RelayState == "OFF" {
		c.phase(op, "powering_on", "Turning on the Spark's power…")
		if _, err := s.relay(ctx, "ON"); err != nil {
			c.uncertain(op, "The power-on command could not be confirmed.")
			return
		}
		state, err := s.relay(ctx, "")
		if err != nil || state != "ON" {
			c.uncertain(op, "The power-on command could not be confirmed.")
			return
		}
		c.setReading(meterReading{RelayState: "ON", ReceivedAt: time.Now().UTC()})
	}
	c.phase(op, "starting", "Starting the Spark…")
	for {
		if _, err := c.host.status(ctx); err == nil {
			c.setMachine("online")
			c.finish(op, "succeeded", "Spark is online.")
			return
		}
		c.setMachine("unreachable")
		if err := pause(ctx, s.lost); err != nil {
			c.finish(op, "failed", "Power on; Spark unavailable. No automatic power cycle was attempted.")
			return
		}
		r, err := s.read(ctx)
		if err != nil {
			c.unavailable("Could not read the Spark plug.")
			c.finish(op, "failed", "Could not confirm startup. No further relay commands were sent.")
			return
		}
		c.setReading(r)
		if r.RelayState != "ON" {
			c.finish(op, "failed", "The plug was switched off outside this operation.")
			return
		}
	}
}

func (c *Controller) powerOff(ctx context.Context, s *meterSession, op *Operation, r meterReading) {
	if r.RelayState == "OFF" {
		c.setMachine("unreachable")
		c.finish(op, "succeeded", "The Spark plug is already off.")
		return
	}
	status, err := c.host.status(ctx)
	if err != nil {
		c.finish(op, "failed", "Spark could not be authenticated over SSH. Power remains supplied.")
		return
	}
	if status.State != "running" && status.State != "degraded" {
		c.finish(op, "failed", "Spark is not ready for a shutdown request. Power remains supplied.")
		return
	}
	if r.DeviceTime.IsZero() {
		c.finish(op, "failed", "The plug did not provide a valid sensor timestamp. Power remains supplied.")
		return
	}
	if r.PowerW == nil || *r.PowerW <= *c.config.OffMaxWatts {
		c.finish(op, "failed", "Running power does not exceed the configured off-state threshold. Check calibration; power remains supplied.")
		return
	}
	c.setMachine("online")
	c.phase(op, "shutting_down", "Requesting a normal Spark shutdown…")
	if err := s.healthy(ctx); err != nil {
		c.finish(op, "failed", "Plug connection interrupted. Power remains supplied.")
		return
	}
	if err := c.host.shutdown(ctx, status.BootID); err != nil {
		c.finish(op, "failed", "Shutdown was not acknowledged. The Spark may be shutting down; power remains supplied.")
		return
	}
	c.phase(op, "waiting_for_off", "Shutdown accepted. Waiting for the Spark's off-state readings…")
	var lowSince, lastSample time.Time
	lastDeviceTime := r.DeviceTime
	for {
		if err := pause(ctx, s.lost); err != nil {
			c.abortCutoff(op)
			return
		}
		r, err := s.read(ctx)
		if err != nil {
			c.unavailable("Spark plug readings were interrupted.")
			c.abortCutoff(op)
			return
		}
		c.setReading(r)
		if r.DeviceTime.IsZero() || !r.DeviceTime.After(lastDeviceTime) {
			c.finish(op, "failed", "The plug's sensor timestamps stopped advancing. No OFF command was sent; power remains supplied.")
			return
		}
		deviceGap := r.DeviceTime.Sub(lastDeviceTime)
		lastDeviceTime = r.DeviceTime
		if r.RelayState != "ON" {
			c.finish(op, "unknown", "The plug changed state outside this operation. No OFF command was sent.")
			return
		}
		reachable, err := c.host.reachable(ctx)
		if err != nil {
			c.abortCutoff(op)
			return
		}
		if reachable {
			c.setMachine("unknown")
		} else {
			c.setMachine("unreachable")
		}
		now := time.Now()
		// Long scheduler/network pauses do not count as continuously observed low power.
		if lastSample.IsZero() || now.Sub(lastSample) > 5*time.Second || deviceGap > 5*time.Second || reachable || r.PowerW == nil || *r.PowerW > *c.config.OffMaxWatts {
			lowSince = time.Time{}
		}
		lastSample = now
		if reachable || r.PowerW == nil || *r.PowerW > *c.config.OffMaxWatts {
			c.phase(op, "waiting_for_off", "Shutdown accepted. Waiting for the Spark's off-state readings…")
			continue
		}
		if lowSince.IsZero() {
			lowSince = now
		}
		observed := now.Sub(lowSince)
		c.phase(op, "verifying_off", fmt.Sprintf("Checking off-state power: %d of 60 seconds.", int(observed.Seconds())))
		if observed < offObservation {
			continue
		}
		if err := s.healthy(ctx); err != nil {
			c.abortCutoff(op)
			return
		}
		if time.Since(r.ReceivedAt) > 5*time.Second {
			c.abortCutoff(op)
			return
		}
		c.phase(op, "cutting_power", "Off-state checks passed. Turning off the plug…")
		// This is the ONLY automatic OFF publish. No recovery/retry path can reach it.
		if _, err := s.relay(ctx, "OFF"); err != nil {
			c.uncertain(op, "The OFF command was sent but could not be confirmed.")
			return
		}
		state, err := s.relay(ctx, "")
		if err != nil || state != "OFF" {
			c.uncertain(op, "The OFF command was sent but could not be confirmed.")
			return
		}
		c.setReading(meterReading{RelayState: "OFF", ReceivedAt: time.Now().UTC()})
		c.setMachine("unreachable")
		c.finish(op, "succeeded", "Spark shut down and plug power is off.")
		return
	}
}

func (c *Controller) abortCutoff(op *Operation) {
	c.finish(op, "failed", "Shutdown checks timed out or were interrupted. No OFF command was sent; power remains supplied.")
}
func (c *Controller) uncertain(op *Operation, message string) {
	c.unavailable("Power state unknown. Reading the plug again; the command will not be replayed.")
	c.finish(op, "unknown", message+" Power state unknown; the command will not be replayed.")
}
