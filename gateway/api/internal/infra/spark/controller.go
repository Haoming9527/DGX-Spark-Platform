package spark

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/admission"
	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/infra/power"
)

const (
	sampleInterval   = 2 * time.Second
	offObservation   = 60 * time.Second
	shutdownDeadline = 10 * time.Minute
	startupDeadline  = 5 * time.Minute
	drainDeadline    = 5 * time.Minute
	minimumOff       = 3 * time.Minute
	minimumReady     = 5 * time.Minute
	observationGap   = 8 * time.Second
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
	Operation               *Operation `json:"operation"`
	CanPowerOn              bool       `json:"can_power_on"`
	CanShutdown             bool       `json:"can_shutdown"`
	ConfigurationError      *string    `json:"configuration_error"`
	Error                   *string    `json:"error"`
	PowerOnBlockedReason    *string    `json:"power_on_blocked_reason"`
	ShutdownBlockedReason   *string    `json:"shutdown_blocked_reason"`
	PowerOnCooldownSeconds  int        `json:"power_on_cooldown_seconds"`
	ShutdownCooldownSeconds int        `json:"shutdown_cooldown_seconds"`
	MaintenanceLocked       *bool      `json:"maintenance_locked"`
	ActiveRequests          int        `json:"active_requests"`
	AdmissionBlockedReason  *string    `json:"admission_blocked_reason"`
}

type hostConnection interface {
	status(context.Context) (hostStatus, error)
	shutdown(context.Context, string) error
	reachable(context.Context) (bool, error)
}
type meterConnection interface {
	read(context.Context) (meterReading, error)
	relay(context.Context, string) (string, error)
	healthy(context.Context) error
	disconnected() <-chan struct{}
	close()
}

type Controller struct {
	ctx                  context.Context
	cancel               context.CancelFunc
	workers              sync.WaitGroup
	config               Config
	host                 hostConnection
	connect              func(context.Context, power.Config) (meterConnection, error)
	now                  func() time.Time
	wait                 func(context.Context, <-chan struct{}) error
	setupError           string
	mu                   sync.Mutex
	operation            *Operation
	requests             map[string]*Operation
	reading              *meterReading
	machine              string
	readError            string
	hostReadError        string
	slot                 chan struct{}
	admission            *admission.Gate
	journal              safetyJournal
	state                safetyState
	safetyError          string
	recovering           bool
	readinessResetReason string
	offSince             time.Time
	readySince           time.Time
	lastHostAt           time.Time
	hostStatus           hostStatus
}

func New(parent context.Context, cfg Config, gate *admission.Gate) *Controller {
	ctx, cancel := context.WithCancel(parent)
	if gate == nil {
		gate = admission.New()
	}
	c := &Controller{ctx: ctx, cancel: cancel, config: cfg, requests: make(map[string]*Operation), machine: "unknown", slot: make(chan struct{}, 1), admission: gate, now: time.Now, wait: pause}
	c.connect = func(ctx context.Context, cfg power.Config) (meterConnection, error) { return connectMeter(ctx, cfg) }
	host, err := newHost(cfg)
	if err == nil {
		c.host = host
	}
	problems := []string{cfg.MeterError, cfg.ControlError}
	if err != nil {
		problems = append(problems, "Spark setup: "+err.Error()+".")
	}
	for _, p := range problems {
		if p != "" {
			c.setupError = strings.TrimSpace(c.setupError + " " + p)
		}
	}
	// Unconfigured Spark monitoring must not take down an otherwise working AI gateway.
	// A broken SSH key must not bypass an already-persisted inference pause.
	if c.setupError == "" || (cfg.ControlKey != "" && cfg.SSHAddr != "") {
		// No configured startup may admit inference before fresh reconciliation,
		// even when the last saved state said the Spark was ready.
		gate.Close("Checking Spark readiness after gateway startup. New AI requests are paused.")
		j, state, err := openJournal(cfg.StateDir)
		if err != nil {
			c.storageFailedLocked()
		} else {
			c.journal, c.state = j, state
			c.recovering = state.AdmissionClosed
			for key, record := range state.Requests {
				op := record.Operation
				op.actor = record.Actor
				if op.Status == "running" {
					now := c.now().UTC()
					op.Status, op.Phase, op.Message, op.FinishedAt = "unknown", "interrupted", "Gateway restarted. The previous operation will not be resumed.", &now
					c.recovering = true
				}
				c.requests[key] = &op
			}
			c.operation = c.requests[state.LastOperation]
			if c.recovering {
				c.state.AdmissionClosed = true
				gate.Close("Spark power recovery is in progress. New AI requests are paused.")
			}
			c.persistLocked()
		}
	}
	// Read-only observation continues without a browser so cooldowns and recovery
	// cannot depend on someone keeping a tab open. Only one session owns the plug.
	if c.host != nil && cfg.MeterError == "" {
		c.workers.Add(1)
		go func() {
			defer c.workers.Done()
			for {
				if c.ctx.Err() != nil {
					return
				}
				c.Read(c.ctx)
				timer := time.NewTimer(sampleInterval)
				select {
				case <-timer.C:
				case <-c.ctx.Done():
					timer.Stop()
					return
				}
			}
		}()
	}
	return c
}

func (c *Controller) Close() {
	c.cancel()
	c.mu.Lock() // Synchronize with Start before Wait (no Add after shutdown).
	c.mu.Unlock()
	c.workers.Wait()
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.journal != nil {
		c.journal.close()
		c.journal = nil
	}
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
func (c *Controller) snapshotLocked() Snapshot {
	s := Snapshot{Device: "dgx-spark-sg", MachineStatus: c.machine}
	if c.freshReadingLocked() {
		r := *c.reading
		s.RelayState, s.ReceivedAt, s.Measurements = &r.RelayState, &r.ReceivedAt, r.Measurements
	} else {
		s.MachineStatus = "unknown"
	}
	if c.operation != nil {
		op := *c.operation
		s.Operation = &op
	}
	s.ConfigurationError = nullable(strings.TrimSpace(c.setupError + " " + c.config.ShutdownError + " " + c.safetyError))
	s.Error = nullable(c.readError)
	if s.Error == nil && !c.busyLocked() && c.reading != nil && c.reading.RelayState == "ON" {
		s.Error = nullable(c.hostReadError)
	}
	_, onCode, onReason := c.blockedLocked("on", false)
	_, shutdownCode, shutdownReason := c.blockedLocked("shutdown", false)
	s.PowerOnBlockedReason, s.ShutdownBlockedReason = nullable(onReason), nullable(shutdownReason)
	s.CanPowerOn, s.CanShutdown = onReason == "", shutdownReason == ""
	s.PowerOnCooldownSeconds = secondsRemaining(c.now(), c.offSince, minimumOff)
	s.ShutdownCooldownSeconds = secondsRemaining(c.now(), c.readySince, minimumReady)
	if onCode != "COOLDOWN" {
		s.PowerOnCooldownSeconds = 0
	}
	if shutdownCode != "COOLDOWN" {
		s.ShutdownCooldownSeconds = 0
	}
	if c.freshHostLocked() {
		s.MaintenanceLocked = c.hostStatus.MaintenanceLocked
	}
	var reason string
	s.ActiveRequests, reason = c.admission.Snapshot()
	s.AdmissionBlockedReason = nullable(reason)
	return s
}
func (c *Controller) snapshot() Snapshot { c.mu.Lock(); defer c.mu.Unlock(); return c.snapshotLocked() }
func (c *Controller) busyLocked() bool   { return c.operation != nil && c.operation.Status == "running" }
func (c *Controller) busy() bool         { c.mu.Lock(); defer c.mu.Unlock(); return c.busyLocked() }

func (c *Controller) Read(parent context.Context) Snapshot {
	if c.busy() || c.ctx.Err() != nil || parent.Err() != nil {
		return c.snapshot()
	}
	// Once observation begins, complete it under the controller's bounded
	// lifetime. Closing a browser tab is not evidence of a hardware failure.
	ctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
	defer cancel()
	select {
	case c.slot <- struct{}{}:
		defer func() { <-c.slot }()
	case <-parent.Done():
		return c.snapshot()
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
	type statusResult struct {
		value hostStatus
		err   error
	}
	hostResult := make(chan statusResult, 1)
	go func() {
		result := statusResult{err: fmt.Errorf("SSH not configured")}
		if c.host != nil {
			result.value, result.err = c.host.status(ctx)
		}
		hostResult <- result
	}()
	session, err := c.connect(ctx, c.config.Meter)
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
	case result := <-hostResult:
		c.observeHost(result.value, result.err)
	case <-ctx.Done():
		c.observeHost(hostStatus{}, ctx.Err())
	}
	return c.snapshot()
}

// Start persists acceptance and closes inference admission before returning.
// Cooldowns are checked here and again at the actual command boundary.
func (c *Controller) Start(action, requestID, actor string) (Operation, int, string, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if (action != "on" && action != "shutdown") || !uuidPattern.MatchString(requestID) || !uuidPattern.MatchString(actor) {
		return Operation{}, 400, "INVALID_REQUEST", "A valid power action and request ID are required."
	}
	key := actor + ":" + strings.ToLower(requestID)
	if previous := c.requests[key]; previous != nil {
		if previous.Action != action {
			return Operation{}, 409, "OPERATION_CONFLICT", "This request ID was used for a different action."
		}
		return *previous, 202, "", ""
	}
	if status, code, message := c.blockedLocked(action, false); message != "" {
		slog.Info("spark_power_blocked", "actor_id", actor, "action", action, "reason", code)
		return Operation{}, status, code, message
	}
	for key, op := range c.requests {
		if op != c.operation && op.Status != "running" && c.now().Sub(op.StartedAt) > 24*time.Hour {
			delete(c.requests, key)
		}
	}
	if len(c.requests) >= 1024 {
		return Operation{}, 503, "SAFETY_UNAVAILABLE", "Power request history is full. Try again later."
	}
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return Operation{}, 503, "SAFETY_UNAVAILABLE", "Could not start a power operation."
	}
	op := &Operation{ID: hex.EncodeToString(id[:]), RequestID: requestID, Action: action, Status: "running", Phase: "checking", Message: "Checking the Spark and its plug…", StartedAt: c.now().UTC(), actor: actor}
	c.requests[key], c.operation, c.state.LastOperation = op, op, key
	c.state.AdmissionClosed = true
	c.admission.Close("Spark is shutting down or starting. New AI requests are paused.")
	if !c.persistLocked() {
		op.Status, op.Phase, op.Message = "failed", "failed", c.safetyError
		return Operation{}, 503, "SAFETY_UNAVAILABLE", c.safetyError
	}
	response := *op
	slog.Info("spark_power_operation", "actor_id", actor, "operation_id", op.ID, "action", action, "result", "accepted")
	c.workers.Add(1)
	go func() { defer c.workers.Done(); c.run(op) }()
	return response, 202, "", ""
}
func (c *Controller) phase(op *Operation, phase, message string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if op.Phase != phase {
		slog.Info("spark_power_phase", "actor_id", op.actor, "operation_id", op.ID, "phase", phase)
	}
	op.Phase, op.Message = phase, message
}
func (c *Controller) finish(op *Operation, status, message string) {
	c.mu.Lock()
	now := c.now().UTC()
	op.Status, op.Phase, op.Message, op.FinishedAt = status, status, message, &now
	// An accepted or possibly delivered OS shutdown cannot be undone by reopening
	// inference immediately. Only read-only reconciliation may clear recovery.
	if c.state.PendingCommand != "" {
		c.recovering = true
		// Pre-command readiness is not recovery evidence after uncertain delivery.
		c.readySince, c.lastHostAt = time.Time{}, time.Time{}
		c.machine = "unknown"
	}
	c.persistLocked()
	c.reconcileLocked()
	c.mu.Unlock()
	slog.Info("spark_power_operation", "actor_id", op.actor, "operation_id", op.ID, "action", op.Action, "result", status, "message", message)
}

func (c *Controller) run(op *Operation) {
	limit := startupDeadline
	if op.Action == "shutdown" {
		limit = drainDeadline + shutdownDeadline + 30*time.Second
	}
	ctx, cancel := context.WithTimeout(c.ctx, limit)
	defer cancel()
	select {
	case c.slot <- struct{}{}:
		defer func() { <-c.slot }()
	case <-ctx.Done():
		c.finish(op, "failed", "Operation cancelled before starting. No command was sent.")
		return
	}
	s, err := c.connect(ctx, c.config.Meter)
	if err != nil {
		c.unavailable("Spark plug unavailable.")
		c.finish(op, "failed", "Could not connect to the plug. No command was sent.")
		return
	}
	defer s.close()
	r, err := s.read(ctx)
	if err != nil {
		c.unavailable("Spark plug unavailable.")
		c.finish(op, "failed", "Could not read the plug. No command was sent.")
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

func (c *Controller) powerOn(ctx context.Context, s meterConnection, op *Operation, r meterReading) {
	if r.RelayState != "OFF" {
		c.finish(op, "failed", "The plug is no longer off. No power command was sent.")
		return
	}
	if !c.commandIntent(ctx, op, "ON") {
		return
	}
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
	c.setReading(meterReading{RelayState: "ON", ReceivedAt: c.now()})
	c.phase(op, "starting", "Starting the Spark…")
	for {
		status, err := c.host.status(ctx)
		c.observeHost(status, err)
		if err == nil && ready(status) {
			c.mu.Lock()
			c.state.PendingCommand, c.recovering = "", false
			c.persistLocked()
			c.mu.Unlock()
			c.finish(op, "succeeded", "Spark is online. Shutdown will be available after five minutes of readiness.")
			return
		}
		if err := c.wait(ctx, s.disconnected()); err != nil {
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
			c.finish(op, "unknown", "The plug changed outside this operation. No further commands were sent.")
			return
		}
	}
}

func (c *Controller) powerOff(ctx context.Context, s meterConnection, op *Operation, r meterReading) {
	// Drain never cancels an admitted request. Fresh meter and SSH checks continue
	// so stale readiness cannot silently mature into shutdown authority.
	drainCtx, cancelDrain := context.WithTimeout(ctx, drainDeadline)
	defer cancelDrain()
	initialBoot := ""
	for {
		status, err := c.host.status(drainCtx)
		c.observeHost(status, err)
		if initialBoot == "" {
			initialBoot = status.BootID
		}
		if err != nil || status.BootID != initialBoot {
			c.finish(op, "failed", "Spark readiness changed. Shutdown cancelled; no shutdown command was sent.")
			return
		}
		c.mu.Lock()
		_, _, blocked := c.blockedLocked("shutdown", true)
		c.mu.Unlock()
		if blocked != "" {
			c.finish(op, "failed", blocked+" No shutdown command was sent.")
			return
		}
		if r.RelayState != "ON" || r.DeviceTime.IsZero() || r.PowerW == nil || *r.PowerW <= *c.config.OffMaxWatts {
			c.finish(op, "failed", "Running power or sensor time is inconsistent with shutdown calibration. No shutdown command was sent.")
			return
		}
		active, _ := c.admission.Snapshot()
		if drainCtx.Err() != nil {
			c.finish(op, "failed", "AI request draining timed out. Shutdown cancelled; no shutdown command was sent.")
			return
		}
		if active == 0 {
			break
		}
		c.phase(op, "draining", fmt.Sprintf("Waiting for %d active AI requests to finish. New requests are blocked.", active))
		if err := c.wait(drainCtx, s.disconnected()); err != nil {
			c.finish(op, "failed", "AI request draining timed out or was interrupted. Shutdown cancelled; no shutdown command was sent.")
			return
		}
		r, err = s.read(drainCtx)
		if err != nil {
			c.unavailable("Spark plug readings were interrupted.")
			c.finish(op, "failed", "Plug readings were interrupted. Shutdown cancelled; no shutdown command was sent.")
			return
		}
		c.setReading(r)
	}
	cancelDrain()
	// Separate deadline: draining never consumes the shutdown verification window.
	shutdownCtx, cancelShutdown := context.WithTimeout(ctx, shutdownDeadline)
	defer cancelShutdown()
	if err := s.healthy(shutdownCtx); err != nil {
		c.finish(op, "failed", "Plug connection interrupted. No shutdown command was sent.")
		return
	}
	if !c.commandIntent(shutdownCtx, op, "shutdown") {
		return
	}
	c.phase(op, "shutting_down", "Requesting a normal Spark shutdown…")
	if err := c.host.shutdown(shutdownCtx, initialBoot); err != nil {
		var command *sshCommandError
		if errors.As(err, &command) {
			// Bounded helper stderr is diagnostic data, never an instruction or
			// evidence authorizing cutoff. Keep it out of the browser response.
			slog.Warn("spark_shutdown_ssh_failed", "operation_id", op.ID, "error", err.Error(), "helper_stderr", command.stderr)
		} else {
			slog.Warn("spark_shutdown_ssh_failed", "operation_id", op.ID, "error", err.Error())
		}
		c.finish(op, "failed", shutdownFailure(err)+" Plug power is left unchanged.")
		return
	}
	c.phase(op, "waiting_for_off", "Shutdown accepted. Waiting for the Spark's off-state readings…")
	var lowSince, lastSample time.Time
	lastDeviceTime := r.DeviceTime
	for {
		if err := c.wait(shutdownCtx, s.disconnected()); err != nil {
			c.abortCutoff(op)
			return
		}
		r, err := s.read(shutdownCtx)
		if err != nil {
			c.unavailable("Spark plug readings were interrupted.")
			c.abortCutoff(op)
			return
		}
		c.setReading(r)
		if r.DeviceTime.IsZero() || !r.DeviceTime.After(lastDeviceTime) {
			c.finish(op, "failed", "Sensor timestamps stopped advancing. No OFF command was sent; plug power is left unchanged.")
			return
		}
		deviceGap := r.DeviceTime.Sub(lastDeviceTime)
		lastDeviceTime = r.DeviceTime
		if r.RelayState != "ON" {
			c.finish(op, "unknown", "The plug changed outside this operation. No OFF command was sent.")
			return
		}
		reachable, err := c.host.reachable(shutdownCtx)
		if err != nil {
			c.abortCutoff(op)
			return
		}
		c.observeHost(hostStatus{}, fmt.Errorf("shutdown in progress"))
		now := c.now()
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
		// Re-query the relay immediately before cutoff. No retry of a mutation.
		state, err := s.relay(shutdownCtx, "")
		if err != nil || state != "ON" || s.healthy(shutdownCtx) != nil || c.now().Sub(r.ReceivedAt) > 5*time.Second {
			c.abortCutoff(op)
			return
		}
		if !c.commandIntent(shutdownCtx, op, "OFF") {
			return
		}
		// Disk synchronization itself can take time; recheck after it returns.
		if s.healthy(shutdownCtx) != nil || c.now().Sub(r.ReceivedAt) > 5*time.Second {
			c.abortCutoff(op)
			return
		}
		c.phase(op, "cutting_power", "Off-state checks passed. Turning off the plug…")
		if _, err := s.relay(shutdownCtx, "OFF"); err != nil {
			c.uncertain(op, "The OFF command could not be confirmed.")
			return
		}
		state, err = s.relay(shutdownCtx, "")
		if err != nil || state != "OFF" {
			c.uncertain(op, "The OFF command could not be confirmed.")
			return
		}
		c.setReading(meterReading{RelayState: "OFF", ReceivedAt: c.now()})
		c.finish(op, "succeeded", "Spark shut down and plug power is off. Wait three minutes before powering on.")
		return
	}
}
func (c *Controller) abortCutoff(op *Operation) {
	c.finish(op, "failed", "Shutdown checks timed out or were interrupted. No OFF command was sent; plug power is left unchanged.")
}
func (c *Controller) uncertain(op *Operation, message string) {
	c.unavailable("Power state unknown. Reading the plug again; the command will not be replayed.")
	c.finish(op, "unknown", message+" Power state unknown; the command will not be replayed.")
}
