//go:build !windows

package attach

import (
	"os"
	"syscall"
)

// sendSIGUSR1 sends SIGUSR1 to the target process to activate the V8 Inspector.
func sendSIGUSR1(pid int) error {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return proc.Signal(syscall.SIGUSR1)
}
