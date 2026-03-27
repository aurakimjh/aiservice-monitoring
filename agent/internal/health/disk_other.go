//go:build !linux && !windows

package health

func diskStatfs(path string) (totalGB, usedGB, usedPct float64) {
	return 0, 0, 0
}
