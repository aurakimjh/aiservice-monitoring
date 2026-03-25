package symbol

import (
	"fmt"
	"os"
	"strings"
)

// DotNetResolver resolves .NET JIT-compiled method addresses using
// crossgen2 PerfMap or EventPipe integration.
//
// .NET 6+ runtimes generate /tmp/perf-{pid}.map when the environment
// variable DOTNET_EnablePerfMap=1 (or COMPlus_PerfMapEnabled=1 on older
// runtimes) is set before process start.
type DotNetResolver struct{}

func (r *DotNetResolver) Language() string { return "dotnet" }

// Available returns true if the process is a .NET process with perf map
// generation enabled.
func (r *DotNetResolver) Available(pid int) bool {
	// Check for existing map file
	mapFile := perfMapPath(pid)
	if _, err := os.Stat(mapFile); err == nil {
		return true
	}

	// Check if this is a .NET process
	cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return false
	}
	cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")
	if !strings.Contains(cmd, "dotnet") && !strings.Contains(cmd, "CoreCLR") {
		return false
	}

	// Check if DOTNET_EnablePerfMap is set
	envData, err := os.ReadFile(fmt.Sprintf("/proc/%d/environ", pid))
	if err != nil {
		return false
	}
	env := strings.ReplaceAll(string(envData), "\x00", "\n")

	return strings.Contains(env, "DOTNET_EnablePerfMap=1") ||
		strings.Contains(env, "COMPlus_PerfMapEnabled=1")
}

// GenerateSymbolMap reads the .NET runtime-generated perf map.
// .NET generates this map automatically when DOTNET_EnablePerfMap=1 is set;
// there is no on-demand generation mechanism.
func (r *DotNetResolver) GenerateSymbolMap(pid int) (string, error) {
	mapFile := perfMapPath(pid)

	if info, err := os.Stat(mapFile); err == nil && info.Size() > 0 {
		return mapFile, nil
	}

	// Also check the crossgen2 map variant
	crossgenMap := fmt.Sprintf("/tmp/crossgen-%d.map", pid)
	if info, err := os.Stat(crossgenMap); err == nil && info.Size() > 0 {
		return crossgenMap, nil
	}

	return "", fmt.Errorf(
		"no perf map found for .NET process %d; ensure DOTNET_EnablePerfMap=1 is set",
		pid,
	)
}

// Cleanup removes the generated symbol map for the given PID.
func (r *DotNetResolver) Cleanup(pid int) {
	// Don't remove .NET perf maps — they are continuously updated by the runtime
}
