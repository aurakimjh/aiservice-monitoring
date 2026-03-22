//go:build windows

package shell

import (
	"fmt"
	"io"
	"os/exec"
)

// openUnixPTY is not supported on Windows; returns an error.
func openUnixPTY(_ *exec.Cmd) (io.ReadWriteCloser, error) {
	return nil, fmt.Errorf("PTY not supported on Windows; use pipe mode")
}

// ptyResizeIoctl is a no-op on Windows.
func ptyResizeIoctl(_ io.ReadWriteCloser, _, _ uint16) error {
	return nil
}
