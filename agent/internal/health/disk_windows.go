//go:build windows

package health

import (
	"syscall"
	"unsafe"
)

func diskStatfs(path string) (totalGB, usedGB, usedPct float64) {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, 0
	}
	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")
	ret, _, _ := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if ret == 0 {
		return 0, 0, 0
	}
	totalGB = float64(totalBytes) / 1024 / 1024 / 1024
	usedGB = float64(totalBytes-totalFreeBytes) / 1024 / 1024 / 1024
	if totalBytes > 0 {
		usedPct = float64(totalBytes-totalFreeBytes) / float64(totalBytes) * 100
	}
	return
}
