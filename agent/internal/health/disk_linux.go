//go:build linux

package health

import "syscall"

func diskStatfs(path string) (totalGB, usedGB, usedPct float64) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, 0
	}
	total := float64(stat.Blocks) * float64(stat.Bsize)
	free := float64(stat.Bavail) * float64(stat.Bsize)
	used := total - free
	totalGB = total / 1024 / 1024 / 1024
	usedGB = used / 1024 / 1024 / 1024
	if total > 0 {
		usedPct = used / total * 100
	}
	return
}
