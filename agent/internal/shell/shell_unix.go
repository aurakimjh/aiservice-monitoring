//go:build !windows

package shell

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"syscall"
	"unsafe"
)

// unixPTY wraps a PTY master file descriptor.
type unixPTY struct {
	master *os.File
}

func (p *unixPTY) Read(b []byte) (int, error)  { return p.master.Read(b) }
func (p *unixPTY) Write(b []byte) (int, error) { return p.master.Write(b) }
func (p *unixPTY) Close() error                { return p.master.Close() }

// Resize implements the resizer interface for unixPTY.
func (p *unixPTY) Resize(cols, rows uint16) error {
	return ptyResizeIoctl(p, cols, rows)
}

// winSize mirrors the C struct winsize used by TIOCSWINSZ.
type winSize struct {
	Rows uint16
	Cols uint16
	X    uint16
	Y    uint16
}

// ptyResizeIoctl sends TIOCSWINSZ to resize the terminal.
func ptyResizeIoctl(pty io.ReadWriteCloser, cols, rows uint16) error {
	u, ok := pty.(*unixPTY)
	if !ok {
		return nil // not a PTY we control
	}
	ws := &winSize{Rows: rows, Cols: cols}
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		u.master.Fd(),
		syscall.TIOCSWINSZ,
		uintptr(unsafe.Pointer(ws)),
	)
	if errno != 0 {
		return fmt.Errorf("TIOCSWINSZ: %w", errno)
	}
	return nil
}

// openUnixPTY opens a PTY pair and starts cmd with the slave as its controlling terminal.
func openUnixPTY(cmd *exec.Cmd) (io.ReadWriteCloser, error) {
	// posix_openpt equivalent: open /dev/ptmx
	master, err := os.OpenFile("/dev/ptmx", os.O_RDWR, 0)
	if err != nil {
		return nil, fmt.Errorf("open /dev/ptmx: %w", err)
	}

	// grantpt
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(),
		syscall.TIOCSPTLCK, 0); errno != 0 {
		_ = master.Close()
		// TIOCSPTLCK may not exist on all platforms; ignore non-critical errors
	}

	// unlockpt: unlock the slave PTY
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(),
		uintptr(0x40045431), 0); errno != 0 { // TIOCSPTLCK
		// non-fatal
	}

	// ptsname: get slave device name
	var slaveName [128]byte
	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, master.Fd(),
		uintptr(0x80085430), // TIOCGPTN
		uintptr(unsafe.Pointer(&slaveName))); errno != 0 {
		_ = master.Close()
		return nil, fmt.Errorf("TIOCGPTN: %w", errno)
	}
	slaveN := int(slaveName[0])
	slavePath := fmt.Sprintf("/dev/pts/%d", slaveN)

	slave, err := os.OpenFile(slavePath, os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		_ = master.Close()
		return nil, fmt.Errorf("open slave PTY %s: %w", slavePath, err)
	}
	defer slave.Close()

	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    3, // fd index of slave in the child (after stdin/out/err)
	}

	if err := cmd.Start(); err != nil {
		_ = master.Close()
		return nil, fmt.Errorf("start shell: %w", err)
	}

	return &unixPTY{master: master}, nil
}
