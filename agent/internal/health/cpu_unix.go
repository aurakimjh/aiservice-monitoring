//go:build !windows

package health

import "syscall"

// processCPUSeconds returns the total user+system CPU time consumed by this process.
func processCPUSeconds() float64 {
	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		return 0
	}
	user := float64(usage.Utime.Sec) + float64(usage.Utime.Usec)/1e6
	sys := float64(usage.Stime.Sec) + float64(usage.Stime.Usec)/1e6
	return user + sys
}
