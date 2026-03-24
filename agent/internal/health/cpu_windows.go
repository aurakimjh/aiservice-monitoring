//go:build windows

package health

import "syscall"

// processCPUSeconds returns the total kernel+user CPU time consumed by this process.
// Windows FILETIME for kernel/user is a duration in 100-nanosecond intervals (not an
// absolute timestamp), so we convert directly instead of using Nanoseconds() which
// subtracts the Windows epoch offset.
func processCPUSeconds() float64 {
	handle, err := syscall.GetCurrentProcess()
	if err != nil {
		return 0
	}
	var creation, exit, kernel, user syscall.Filetime
	if err := syscall.GetProcessTimes(handle, &creation, &exit, &kernel, &user); err != nil {
		return 0
	}
	k := int64(kernel.HighDateTime)<<32 | int64(kernel.LowDateTime)
	u := int64(user.HighDateTime)<<32 | int64(user.LowDateTime)
	return float64(k+u) / 1e7 // 100ns units → seconds
}
