package spark

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"
)

func ready(s hostStatus) bool { return s.State == "running" || s.State == "degraded" }
func secondsRemaining(now, since time.Time, minimum time.Duration) int {
	if since.IsZero() {
		return int(minimum.Seconds())
	}
	remaining := minimum - now.Sub(since)
	if remaining <= 0 {
		return 0
	}
	return int(math.Ceil(remaining.Seconds()))
}
func (c *Controller) freshReadingLocked() bool {
	return c.reading != nil && c.now().Sub(c.reading.ReceivedAt) >= 0 && c.now().Sub(c.reading.ReceivedAt) <= observationGap
}
func (c *Controller) freshHostLocked() bool {
	return !c.lastHostAt.IsZero() && c.now().Sub(c.lastHostAt) >= 0 && c.now().Sub(c.lastHostAt) <= observationGap
}
func (c *Controller) storageFailedLocked() {
	c.safetyError = "Spark safety storage is unavailable. Check the persistent volume, permissions and controller lock before using power controls."
	slog.Error("spark_power_safety_storage_unavailable")
}
func (c *Controller) persistLocked() bool {
	if c.journal == nil || c.safetyError != "" {
		return false
	}
	c.state.Requests = make(map[string]savedOperation, len(c.requests))
	for key, op := range c.requests {
		c.state.Requests[key] = savedOperation{Operation: *op, Actor: op.actor}
	}
	if err := c.journal.save(c.state); err != nil {
		c.storageFailedLocked()
		return false
	}
	return true
}

// Apply the same policy to snapshots, API acceptance and command execution.
func (c *Controller) blockedLocked(action string, worker bool) (int, string, string) {
	if c.ctx.Err() != nil {
		return 503, "SAFETY_UNAVAILABLE", "The gateway is shutting down."
	}
	if c.setupError != "" {
		return 503, "SAFETY_UNAVAILABLE", c.setupError
	}
	if c.safetyError != "" {
		return 503, "SAFETY_UNAVAILABLE", c.safetyError
	}
	if c.journal == nil {
		return 503, "SAFETY_UNAVAILABLE", "Spark safety storage is not configured."
	}
	if !worker && c.busyLocked() {
		return 409, "OPERATION_CONFLICT", "A Spark power operation is already running."
	}
	if !c.freshReadingLocked() {
		return 409, "NOT_READY", "Waiting for fresh Spark plug readings."
	}
	if action == "on" {
		if c.reading.RelayState != "OFF" {
			return 409, "NOT_READY", "The Spark plug is already on"
		}
		if seconds := secondsRemaining(c.now(), c.offSince, minimumOff); seconds > 0 {
			return 409, "COOLDOWN", fmt.Sprintf("Power on is available after %d.", seconds)
		}
		return 0, "", ""
	}
	if c.config.ShutdownError != "" {
		return 503, "SAFETY_UNAVAILABLE", c.config.ShutdownError
	}
	if c.reading.RelayState != "ON" {
		return 409, "NOT_READY", "The Spark plug is off."
	}
	if !c.freshHostLocked() || !ready(c.hostStatus) {
		return 409, "NOT_READY", "Waiting for authenticated Spark readiness. Power remains supplied."
	}
	if err := c.hostStatus.shutdownReadinessError(); err != nil {
		if c.hostStatus.MaintenanceLocked != nil && *c.hostStatus.MaintenanceLocked {
			return 409, "MAINTENANCE_LOCK", "Spark maintenance lock is active. Clear it on the Spark when maintenance is finished."
		}
		return 503, "SAFETY_UNAVAILABLE", "Update the Spark power helper to protocol 2 before using shutdown."
	}
	if c.recovering {
		return 409, "RECOVERY_REQUIRED", c.recoveryMessageLocked()
	}
	if seconds := secondsRemaining(c.now(), c.readySince, minimumReady); seconds > 0 {
		return 409, "COOLDOWN", fmt.Sprintf("Shutdown is available after %d.", seconds)
	}
	if *c.hostStatus.UptimeSeconds < minimumReady.Seconds() {
		return 409, "COOLDOWN", "The Spark has not completed its minimum running interval."
	}
	return 0, "", ""
}

func (c *Controller) setReading(r meterReading) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	continuous := c.freshReadingLocked() && c.reading.RelayState == r.RelayState
	if r.RelayState == "OFF" {
		if !continuous || c.offSince.IsZero() {
			c.offSince = now
		}
		c.readySince, c.lastHostAt = time.Time{}, time.Time{}
		c.machine = "unreachable"
	} else {
		c.offSince = time.Time{}
		if !continuous {
			if !c.readySince.IsZero() {
				c.readinessResetReason = "Timer restarted because plug readings were interrupted."
			}
			c.readySince = time.Time{}
		}
	}
	c.reading, c.readError = &r, ""
	if c.journal != nil && c.state.RelayState != r.RelayState {
		c.state.RelayState, c.state.TransitionAt = r.RelayState, now.UTC()
		if r.RelayState == "OFF" {
			c.state.AdmissionClosed = true
		}
		c.persistLocked()
		slog.Info("spark_power_observed_transition", "relay_state", r.RelayState)
	}
}
func (c *Controller) observeHost(status hostStatus, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if err != nil || !ready(status) || !c.freshReadingLocked() || c.reading.RelayState != "ON" {
		if !c.busyLocked() && c.freshReadingLocked() && c.reading.RelayState == "ON" {
			message := "Spark SSH responded, but the operating system is not ready."
			if err != nil {
				message = readinessFailure(err)
			}
			if message != c.hostReadError {
				slog.Warn("spark_readiness_failed", "reason", message)
			}
			c.hostReadError = message
		}
		c.readinessResetReason = "Timer restarted because a Spark readiness check failed."
		c.readySince, c.lastHostAt = time.Time{}, time.Time{}
		c.hostStatus = hostStatus{}
		c.machine = "unreachable"
		if c.journal != nil {
			if !c.state.AdmissionClosed {
				c.state.AdmissionClosed = true
				c.persistLocked()
			}
		}
		return
	}
	if c.hostReadError != "" {
		slog.Info("spark_readiness_restored")
		c.hostReadError = ""
	}
	continuous := c.freshHostLocked() && c.hostStatus.BootID == status.BootID
	if status.UptimeSeconds != nil && c.hostStatus.UptimeSeconds != nil && *status.UptimeSeconds < *c.hostStatus.UptimeSeconds {
		continuous = false
	}
	if !continuous || c.readySince.IsZero() {
		if !c.readySince.IsZero() {
			c.readinessResetReason = "Timer restarted because readiness checks were interrupted or the Spark restarted."
		}
		c.readySince = now
	}
	c.hostStatus, c.lastHostAt, c.machine = status, now, "online"
	if c.journal != nil && c.state.BootID != status.BootID {
		c.state.BootID = status.BootID
		c.persistLocked()
	}
	c.reconcileLocked()
}
func (c *Controller) unavailable(message string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reading, c.machine, c.readError = nil, "unknown", message
	c.readinessResetReason = "Timer restarted because plug readings were interrupted."
	c.offSince, c.readySince, c.lastHostAt = time.Time{}, time.Time{}, time.Time{}
	if c.journal != nil {
		if !c.state.AdmissionClosed {
			c.state.AdmissionClosed = true
			c.persistLocked()
		}
	}
}
func (c *Controller) reconcileLocked() {
	defer c.syncAdmissionLocked()
	if c.busyLocked() || c.journal == nil || c.safetyError != "" || c.ctx.Err() != nil {
		return
	}
	if !c.freshReadingLocked() || !c.freshHostLocked() || c.reading.RelayState != "ON" || !ready(c.hostStatus) {
		return
	}
	if c.recovering && secondsRemaining(c.now(), c.readySince, minimumReady) > 0 {
		return
	}
	if c.state.AdmissionClosed || c.state.PendingCommand != "" {
		closed, pending := c.state.AdmissionClosed, c.state.PendingCommand
		c.state.AdmissionClosed, c.state.PendingCommand = false, ""
		if !c.persistLocked() {
			c.state.AdmissionClosed, c.state.PendingCommand = closed, pending
			return
		}
		slog.Info("spark_power_admission_reopened", "boot_id", c.hostStatus.BootID)
	}
	c.recovering = false
	c.readinessResetReason = ""
}

// Monitoring and power-control cooldowns must not block inference.
func (c *Controller) syncAdmissionLocked() {
	if c.busyLocked() && c.operation.Action == "shutdown" {
		c.admission.Close("Spark is shutting down. New AI requests are paused while active requests finish.")
		return
	}
	if c.state.PendingCommand == "shutdown" || c.state.PendingCommand == "OFF" {
		c.admission.Close("Spark shutdown was requested. Waiting for confirmed recovery before accepting new AI requests.")
		return
	}
	c.admission.Open()
}

// Display the controller's monotonic recovery timer.
func (c *Controller) recoveryMessageLocked() string {
	seconds := secondsRemaining(c.now(), c.readySince, minimumReady)
	message := fmt.Sprintf("Checking Spark stability: %d:%02d remaining of 5 minutes.", seconds/60, seconds%60)
	if c.readinessResetReason != "" {
		message += " " + c.readinessResetReason
	}
	return message
}

// Persist intent before sending commands; never replay it after recovery.
func (c *Controller) commandIntent(ctx context.Context, op *Operation, command string) bool {
	c.mu.Lock()
	message := ""
	if ctx.Err() != nil {
		message = "Operation cancelled before sending a command."
	}
	if message == "" && command != "OFF" {
		_, _, message = c.blockedLocked(op.Action, true)
	}
	if message == "" && command == "OFF" {
		if c.safetyError != "" || c.journal == nil || c.ctx.Err() != nil {
			message = "Safety state is unavailable. No OFF command was sent."
		}
	}
	if message == "" {
		c.state.PendingCommand, c.state.AdmissionClosed = command, true
		if !c.persistLocked() {
			message = c.safetyError
		}
	}
	c.mu.Unlock()
	if message != "" {
		c.finish(op, "failed", message)
		return false
	}
	// Disk IO may have consumed the deadline; never send a cancelled command.
	if ctx.Err() != nil {
		c.finish(op, "failed", "Operation cancelled before sending a command.")
		return false
	}
	if command != "OFF" {
		c.mu.Lock()
		_, _, message = c.blockedLocked(op.Action, true)
		c.mu.Unlock()
		if message != "" {
			c.finish(op, "failed", message)
			return false
		}
	}
	return true
}
