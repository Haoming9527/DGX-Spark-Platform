//go:build !linux

package spark

import (
	"errors"
	"os"
)

// Real power control requires the Linux filesystem locking/durability contract
// used by the Pi deployment. Other platforms can still serve readings and AI.
func lockJournal(string) (*os.File, error) {
	return nil, errors.New("power safety storage requires Linux")
}
func syncJournalDirectory(string) error { return errors.New("power safety storage requires Linux") }
