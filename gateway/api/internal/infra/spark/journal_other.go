//go:build !linux

package spark

import (
	"errors"
	"os"
)

// Power control requires Linux locking and durability guarantees.
func lockJournal(string) (*os.File, error) {
	return nil, errors.New("power safety storage requires Linux")
}
func syncJournalDirectory(string) error { return errors.New("power safety storage requires Linux") }
