//go:build windows

package health

import "syscall"

// processCPUSeconds returns the total kernel+user CPU time consumed by this process.
func processCPUSeconds() float64 {
	handle, err := syscall.GetCurrentProcess()
	if err != nil {
		return 0
	}
	var creation, exit, kernel, user syscall.Filetime
	if err := syscall.GetProcessTimes(handle, &creation, &exit, &kernel, &user); err != nil {
		return 0
	}
	return float64(kernel.Nanoseconds()+user.Nanoseconds()) / 1e9
}
