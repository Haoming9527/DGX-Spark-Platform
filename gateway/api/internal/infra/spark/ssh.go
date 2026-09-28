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
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

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
		return err
	}
	client := ssh.NewClient(clientConn, channels, requests)
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	var output boundedOutput
	session.Stdout = &output
	session.Stderr = io.Discard
	// Commands are fixed, except for a strictly validated boot UUID during shutdown.
	if err := session.Run(command); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := json.Unmarshal(output.Bytes(), out); err != nil {
		return errors.New("invalid Spark helper response")
	}
	return nil
}

func (h *sparkHost) status(ctx context.Context) (hostStatus, error) {
	var status hostStatus
	err := h.run(ctx, "status", &status)
	if err == nil && (!uuidPattern.MatchString(status.BootID) || status.State == "") {
		err = errors.New("invalid Spark status")
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

// A TCP listener counts as reachable even if SSH authentication would fail.
// DNS/configuration failures cannot be used as evidence that a host went away.
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
