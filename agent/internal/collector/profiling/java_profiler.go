package profiling

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"time"
)

// collectJavaProfile captures a CPU or memory profile from a Java process.
// Uses async-profiler (Apache 2.0) or JDK Flight Recorder.
func collectJavaProfile(ctx context.Context, proc profilableProcess, profileType string, durationSec int) ([]byte, string, error) {
	// Try async-profiler first (Apache 2.0 licensed)
	data, format, err := collectWithAsyncProfiler(ctx, proc, profileType, durationSec)
	if err == nil {
		return data, format, nil
	}

	// Fallback to JDK Flight Recorder (JDK 11+)
	return collectWithJFR(ctx, proc, profileType, durationSec)
}

// collectWithAsyncProfiler uses async-profiler to capture profiles.
func collectWithAsyncProfiler(ctx context.Context, proc profilableProcess, profileType string, durationSec int) ([]byte, string, error) {
	asprofPath, err := exec.LookPath("asprof")
	if err != nil {
		// Try alternative path
		asprofPath = "/opt/async-profiler/bin/asprof"
		if _, statErr := os.Stat(asprofPath); statErr != nil {
			return nil, "", fmt.Errorf("async-profiler not found: %w", err)
		}
	}

	outFile := fmt.Sprintf("/tmp/aitop-jprofile-%d-%d.jfr", proc.PID, time.Now().UnixMilli())
	defer os.Remove(outFile)

	timeout := time.Duration(durationSec+10) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	event := "cpu"
	switch profileType {
	case "memory", "alloc":
		event = "alloc"
	case "lock":
		event = "lock"
	case "thread":
		event = "wall"
	}

	cmd := exec.CommandContext(cmdCtx, asprofPath,
		"-e", event,
		"-d", strconv.Itoa(durationSec),
		"-f", outFile,
		strconv.Itoa(proc.PID),
	)
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		return nil, "", fmt.Errorf("async-profiler pid=%d: %w", proc.PID, err)
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, "", fmt.Errorf("read async-profiler output: %w", err)
	}

	return data, "jfr", nil
}

// collectWithJFR uses JDK Flight Recorder for profiling (JDK 11+).
func collectWithJFR(ctx context.Context, proc profilableProcess, profileType string, durationSec int) ([]byte, string, error) {
	jcmdPath, err := exec.LookPath("jcmd")
	if err != nil {
		return nil, "", fmt.Errorf("jcmd not found (JDK 11+ required): %w", err)
	}

	outFile := fmt.Sprintf("/tmp/aitop-jfr-%d-%d.jfr", proc.PID, time.Now().UnixMilli())
	defer os.Remove(outFile)

	pidStr := strconv.Itoa(proc.PID)
	durationStr := fmt.Sprintf("%ds", durationSec)

	timeout := time.Duration(durationSec+15) * time.Second
	cmdCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Start JFR recording
	settings := "profile"
	if profileType == "memory" || profileType == "alloc" {
		settings = "default"
	}

	startCmd := exec.CommandContext(cmdCtx, jcmdPath, pidStr,
		"JFR.start",
		"name=aitop",
		"settings="+settings,
		"duration="+durationStr,
		"filename="+outFile,
	)
	startCmd.Stderr = nil

	if err := startCmd.Run(); err != nil {
		return nil, "", fmt.Errorf("JFR.start pid=%d: %w", proc.PID, err)
	}

	// Wait for recording to complete
	time.Sleep(time.Duration(durationSec+2) * time.Second)

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, "", fmt.Errorf("read JFR output: %w", err)
	}

	return data, "jfr", nil
}
