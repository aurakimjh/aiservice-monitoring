package perfebpf

import (
	"os"
	"strconv"
	"strings"
)

// Linux capability bit positions (from include/uapi/linux/capability.h).
const (
	capSysAdmin  = 21 // CAP_SYS_ADMIN
	capSysPtrace = 19 // CAP_SYS_PTRACE
	capBPF       = 39 // CAP_BPF (Linux 5.8+)
	capPerfmon   = 38 // CAP_PERFMON (Linux 5.8+)
)

// checkCapabilities verifies CAP_BPF, CAP_PERFMON, CAP_SYS_ADMIN, and
// CAP_SYS_PTRACE by reading the effective capability bitmask from
// /proc/self/status.  Returns individual boolean flags.
//
// If /proc/self/status is unreadable (non-Linux), all capabilities fall
// back to checking whether the process runs as root (uid 0).
func checkCapabilities() (hasBPF, hasPerfmon, hasSysAdmin, hasPtrace bool) {
	// Fast-path: running as root grants all capabilities.
	if os.Getuid() == 0 {
		return true, true, true, true
	}

	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return false, false, false, false
	}

	var capEff uint64
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "CapEff:") {
			hex := strings.TrimSpace(strings.TrimPrefix(line, "CapEff:"))
			capEff, err = strconv.ParseUint(hex, 16, 64)
			if err != nil {
				return false, false, false, false
			}
			break
		}
	}

	hasBPF = capEff&(1<<capBPF) != 0
	hasPerfmon = capEff&(1<<capPerfmon) != 0
	hasSysAdmin = capEff&(1<<capSysAdmin) != 0
	hasPtrace = capEff&(1<<capSysPtrace) != 0
	return
}

// hasCapability checks a single capability bit in the effective set.
func hasCapability(bit int) bool {
	if os.Getuid() == 0 {
		return true
	}
	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "CapEff:") {
			hex := strings.TrimSpace(strings.TrimPrefix(line, "CapEff:"))
			capEff, err := strconv.ParseUint(hex, 16, 64)
			if err != nil {
				return false
			}
			return capEff&(1<<uint(bit)) != 0
		}
	}
	return false
}
