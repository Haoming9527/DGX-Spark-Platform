package spark

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// This journal stores safety decisions, never queued work. Persisted commands
// are evidence of uncertainty after a crash, not authority to execute again.
type savedOperation struct {
	Operation Operation `json:"operation"`
	Actor     string    `json:"actor"`
}
type safetyState struct {
	Version         int                       `json:"version"`
	Requests        map[string]savedOperation `json:"requests"`
	LastOperation   string                    `json:"last_operation,omitempty"`
	BootID          string                    `json:"boot_id,omitempty"`
	RelayState      string                    `json:"relay_state,omitempty"`
	TransitionAt    time.Time                 `json:"transition_at"`
	PendingCommand  string                    `json:"pending_command,omitempty"`
	AdmissionClosed bool                      `json:"admission_closed"`
}

type safetyJournal interface {
	save(safetyState) error
	close()
}
type fileJournal struct {
	dir  string
	lock *os.File
}

func openJournal(dir string) (*fileJournal, safetyState, error) {
	// Missing history cannot establish readiness. A fresh installation observes
	// a complete recovery interval before reopening inference admission.
	state := safetyState{Version: 1, Requests: make(map[string]savedOperation), AdmissionClosed: true}
	if !filepath.IsAbs(dir) {
		return nil, state, errors.New("state directory must be absolute")
	}
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, state, errors.New("state directory missing or invalid")
	}
	lock, err := lockJournal(filepath.Join(dir, "controller.lock"))
	if err != nil {
		return nil, state, err
	}
	j := &fileJournal{dir: dir, lock: lock}
	fail := func(err error) (*fileJournal, safetyState, error) { j.close(); return nil, state, err }
	path := filepath.Join(dir, "safety.json")
	info, err = os.Lstat(path)
	if os.IsNotExist(err) {
		if err := j.save(state); err != nil {
			return fail(err)
		}
		return j, state, nil
	}
	if err != nil {
		return fail(err)
	}
	if !info.Mode().IsRegular() || info.Size() > 2*1024*1024 {
		return fail(errors.New("invalid safety journal"))
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return fail(err)
	}
	if err := decodeState(raw, &state); err != nil {
		return fail(err)
	}
	return j, state, nil
}

func decodeState(raw []byte, destination *safetyState) error {
	// Validate a zero-value candidate, never defaults left over from initialization.
	var decoded safetyState
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(&decoded) != nil || d.Decode(&struct{}{}) != io.EOF || decoded.Version != 1 || decoded.Requests == nil || len(decoded.Requests) > 1024 {
		return errors.New("invalid safety journal")
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return errors.New("invalid safety journal")
	}
	for _, key := range []string{"version", "requests", "transition_at", "admission_closed"} {
		if value, ok := fields[key]; !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return errors.New("incomplete safety journal")
		}
	}
	s := &decoded
	if s.RelayState != "" && s.RelayState != "ON" && s.RelayState != "OFF" {
		return errors.New("invalid relay history")
	}
	if s.BootID != "" && !uuidPattern.MatchString(s.BootID) {
		return errors.New("invalid boot history")
	}
	switch s.PendingCommand {
	case "", "ON", "OFF", "shutdown":
	default:
		return errors.New("invalid command history")
	}
	if s.PendingCommand != "" && !s.AdmissionClosed {
		return errors.New("inconsistent command history")
	}
	for key, record := range s.Requests {
		op := record.Operation
		if !uuidPattern.MatchString(record.Actor) || !uuidPattern.MatchString(op.RequestID) || key != record.Actor+":"+strings.ToLower(op.RequestID) || len(op.ID) != 32 || op.StartedAt.IsZero() {
			return errors.New("invalid operation history")
		}
		if op.Action != "on" && op.Action != "shutdown" {
			return errors.New("invalid action history")
		}
		switch op.Status {
		case "running", "succeeded", "failed", "unknown":
		default:
			return errors.New("invalid operation status")
		}
		if op.Status == "running" && !s.AdmissionClosed {
			return errors.New("inconsistent operation history")
		}
	}
	if s.LastOperation != "" {
		if _, ok := s.Requests[s.LastOperation]; !ok {
			return errors.New("missing operation history")
		}
	}
	// Preserve the validated history in the caller, including admission and intents.
	*destination = decoded
	return nil
}

func (j *fileJournal) save(s safetyState) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(j.dir, ".safety-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(raw); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(name, filepath.Join(j.dir, "safety.json")); err != nil {
		return err
	}
	if err := syncJournalDirectory(j.dir); err != nil {
		return fmt.Errorf("sync state directory: %w", err)
	}
	return nil
}
func (j *fileJournal) close() {
	if j.lock != nil {
		_ = j.lock.Close()
	}
}
