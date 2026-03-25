package script_test

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/script"
)

func TestExecute_ShellScript(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test skipped on Windows")
	}

	// Write a temporary shell script.
	tmp := t.TempDir()
	scriptPath := filepath.Join(tmp, "test.sh")
	if err := os.WriteFile(scriptPath, []byte("#!/bin/sh\necho hello\n"), 0700); err != nil {
		t.Fatal(err)
	}

	exec := script.New(script.Config{Timeout: 5 * time.Second})
	result := exec.Execute(context.Background(), scriptPath)

	if result.ExitCode != 0 {
		t.Errorf("expected exit 0, got %d (stderr: %s error: %s)", result.ExitCode, result.Stderr, result.Error)
	}
	if result.Stdout != "hello\n" {
		t.Errorf("expected stdout 'hello\\n', got %q", result.Stdout)
	}
	if result.TimedOut {
		t.Error("expected no timeout")
	}
}

func TestExecute_Timeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test skipped on Windows")
	}

	tmp := t.TempDir()
	scriptPath := filepath.Join(tmp, "slow.sh")
	if err := os.WriteFile(scriptPath, []byte("#!/bin/sh\nsleep 60\n"), 0700); err != nil {
		t.Fatal(err)
	}

	exec := script.New(script.Config{Timeout: 100 * time.Millisecond})
	result := exec.Execute(context.Background(), scriptPath)

	if !result.TimedOut {
		t.Error("expected timeout, but script completed normally")
	}
}

func TestExecute_ContextCancellation(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test skipped on Windows")
	}

	tmp := t.TempDir()
	scriptPath := filepath.Join(tmp, "cancel.sh")
	if err := os.WriteFile(scriptPath, []byte("#!/bin/sh\nsleep 60\n"), 0700); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	exec := script.New(script.Config{Timeout: 10 * time.Second})
	result := exec.Execute(ctx, scriptPath)

	// Either timed out or cancelled — either way exit code should be non-zero.
	if result.ExitCode == 0 && result.Error == "" && !result.TimedOut {
		t.Error("expected script to be interrupted by context cancellation")
	}
}

func TestExecute_NonExistentScript(t *testing.T) {
	exec := script.New(script.Config{})
	result := exec.Execute(context.Background(), "/nonexistent/path/script.sh")

	if result.Error == "" && result.ExitCode == 0 {
		t.Error("expected error for non-existent script")
	}
}

func TestLimitWriter(t *testing.T) {
	// Test that large output is capped.
	if runtime.GOOS == "windows" {
		t.Skip("shell script test skipped on Windows")
	}

	tmp := t.TempDir()
	scriptPath := filepath.Join(tmp, "big.sh")
	// Generate 2 KiB of output.
	content := "#!/bin/sh\nfor i in $(seq 1 100); do echo \"line $i aaaaaaaaaaaaaaaaaaa\"; done\n"
	if err := os.WriteFile(scriptPath, []byte(content), 0700); err != nil {
		t.Fatal(err)
	}

	exec := script.New(script.Config{MaxOutputBytes: 512}) // cap at 512 bytes
	result := exec.Execute(context.Background(), scriptPath)

	if len(result.Stdout) > 512 {
		t.Errorf("stdout exceeds MaxOutputBytes cap: got %d bytes", len(result.Stdout))
	}
}
