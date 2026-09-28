package spark

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"os"
	"regexp"
	"strings"
	"syscall"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type sshStageError struct {
	stage string
	err   error
}

type sshCommandError struct {
	err    error
	stderr string
}

func (e *sshCommandError) Error() string { return e.err.Error() }
func (e *sshCommandError) Unwrap() error { return e.err }

func shutdownFailure(err error) string {
	var command *sshCommandError
	if errors.As(err, &command) {
		message := strings.ToLower(command.stderr)
		switch {
		case strings.Contains(message, "operation inhibited by"), strings.Contains(message, "active block inhibitor"):
			return "Shutdown blocked by an application or maintenance task."
		case strings.Contains(message, "is logged in"):
			return "Shutdown blocked by a logged-in user. Log out of desktop and SSH sessions."
		case strings.Contains(message, "maintenance lock is active"):
			return "Shutdown blocked by the Spark maintenance lock."
		case strings.Contains(message, "rebooted since"):
			return "Shutdown cancelled because the Spark restarted."
		case strings.Contains(message, "a password is required"), strings.Contains(message, "not allowed to execute"):
			return "Shutdown helper permission denied. Reinstall the Spark power helper."
		}
	}
	return "Shutdown was not acknowledged. Check the gateway log for the SSH failure."
}

// Drain stderr without letting remote output grow memory or block stdout.
type diagnosticOutput struct{ bytes.Buffer }

func (w *diagnosticOutput) Write(p []byte) (int, error) {
	n := len(p)
	if remaining := 4096 - w.Len(); remaining > 0 {
		if len(p) > remaining {
			p = p[:remaining]
		}
		_, _ = w.Buffer.Write(p)
	}
	return n, nil
}

func (e *sshStageError) Error() string { return e.stage + ": " + e.err.Error() }
func (e *sshStageError) Unwrap() error { return e.err }

// Readiness messages never expose raw SSH errors or remote output.
func readinessFailure(err error) string {
	var dns *net.DNSError
	var key *knownhosts.KeyError
	var network net.Error
	var stage *sshStageError
	var exit *ssh.ExitError
	switch {
	case errors.As(err, &dns):
		return "The gateway could not resolve the Spark SSH hostname. Check the container hostname mapping."
	case errors.As(err, &key):
		return "Spark SSH host identity verification failed. Verify the Spark host key and the gateway known-hosts file."
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &network) && network.Timeout():
		return "The gateway's Spark SSH readiness check timed out."
	case errors.Is(err, context.Canceled):
		return "The Spark SSH readiness check was cancelled."
	case errors.Is(err, syscall.ECONNREFUSED):
		return "The Spark refused the gateway's SSH connection. Check its SSH service and configured port."
	case errors.As(err, &exit):
		return "Spark SSH connected, but the restricted status helper failed. Check the helper installation and sudo permission."
	case errors.As(err, &stage):
		switch stage.stage {
		case "handshake":
			if strings.Contains(stage.err.Error(), "unable to authenticate") {
				return "Spark rejected the gateway's SSH authentication. Check the configured account and authorized key."
			}
			return "The gateway could not complete the Spark SSH handshake."
		case "response":
			return "The Spark status helper returned an invalid response. Check the installed helper."
		case "session", "command":
			return "Spark SSH connected, but the status command could not complete."
		}
	}
	return "The gateway could not complete the Spark SSH readiness check."
}

type hostStatus struct {
	BootID            string   `json:"boot_id"`
	State             string   `json:"state"`
	ProtocolVersion   int      `json:"protocol_version"`
	UptimeSeconds     *float64 `json:"uptime_seconds"`
	MaintenanceLocked *bool    `json:"maintenance_locked"`
}

func (s hostStatus) shutdownReadinessError() error {
	if s.ProtocolVersion != 2 || s.UptimeSeconds == nil || math.IsNaN(*s.UptimeSeconds) || math.IsInf(*s.UptimeSeconds, 0) || *s.UptimeSeconds < 0 || s.MaintenanceLocked == nil {
		return errors.New("update the Spark power helper to protocol version 2 before shutting down")
	}
	if *s.MaintenanceLocked {
		return errors.New("Spark maintenance lock is active; clear it on the Spark after maintenance finishes")
	}
	return nil
}

type sparkHost struct {
	addr   string
	config *ssh.ClientConfig
}

func newHost(c Config) (*sparkHost, error) {
	if err := c.validateSSH(); err != nil {
		return nil, err
	}
	key, err := os.ReadFile(c.KeyFile)
	if err != nil {
		return nil, errors.New("the Spark SSH private key is not readable")
	}
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, errors.New("the Spark SSH private key could not be loaded")
	}
	verify, err := knownhosts.New(c.KnownHostsFile)
	if err != nil {
		return nil, errors.New("the verified Spark known-hosts file could not be loaded")
	}
	return &sparkHost{addr: c.SSHAddr, config: &ssh.ClientConfig{
		User: c.SSHUser, Auth: []ssh.AuthMethod{ssh.PublicKeys(signer)}, HostKeyCallback: verify,
		HostKeyAlgorithms: []string{ssh.KeyAlgoED25519},
		Timeout:           3 * time.Second,
	}}, nil
}

type boundedOutput struct{ bytes.Buffer }

func (w *boundedOutput) Write(p []byte) (int, error) {
	if w.Len()+len(p) > 4096 {
		return 0, errors.New("SSH response too large")
	}
	return w.Buffer.Write(p)
}

func (h *sparkHost) run(parent context.Context, command string, out any) error {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	conn, err := (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "tcp", h.addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	deadline, _ := ctx.Deadline()
	if err := conn.SetDeadline(deadline); err != nil {
		return err
	}
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	clientConn, channels, requests, err := ssh.NewClientConn(conn, h.addr, h.config)
	if err != nil {
		return &sshStageError{"handshake", err}
	}
	client := ssh.NewClient(clientConn, channels, requests)
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		return &sshStageError{"session", err}
	}
	defer session.Close()
	var output boundedOutput
	var diagnostic diagnosticOutput
	session.Stdout = &output
	session.Stderr = io.Discard
	if strings.HasPrefix(command, "shutdown ") {
		session.Stderr = &diagnostic
	}
	if err := session.Run(command); err != nil {
		return &sshStageError{"command", &sshCommandError{err: err, stderr: strings.TrimSpace(diagnostic.String())}}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := json.Unmarshal(output.Bytes(), out); err != nil {
		return &sshStageError{"response", errors.New("invalid Spark helper response")}
	}
	return nil
}

func (h *sparkHost) status(ctx context.Context) (hostStatus, error) {
	var status hostStatus
	err := h.run(ctx, "status", &status)
	if err == nil && (!uuidPattern.MatchString(status.BootID) || status.State == "") {
		err = &sshStageError{"response", errors.New("invalid Spark status")}
	}
	return status, err
}

func (h *sparkHost) shutdown(ctx context.Context, bootID string) error {
	if !uuidPattern.MatchString(bootID) {
		return errors.New("invalid expected Spark boot ID")
	}
	var ack struct {
		Accepted        bool   `json:"accepted"`
		BootID          string `json:"boot_id"`
		ProtocolVersion int    `json:"protocol_version"`
	}
	if err := h.run(ctx, "shutdown "+bootID, &ack); err != nil {
		return err
	}
	if !ack.Accepted || ack.BootID != bootID || ack.ProtocolVersion != 2 {
		return fmt.Errorf("shutdown was not acknowledged for the current Spark boot")
	}
	return nil
}

// Any TCP listener is reachable; DNS failures cannot establish shutdown.
func (h *sparkHost) reachable(ctx context.Context) (bool, error) {
	conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "tcp", h.addr)
	if err == nil {
		_ = conn.Close()
		return true, nil
	}
	if ctx.Err() != nil {
		return false, ctx.Err()
	}
	var dns *net.DNSError
	if errors.As(err, &dns) {
		return false, err
	}
	var op *net.OpError
	if !errors.As(err, &op) {
		return false, err
	}
	return false, nil
}
