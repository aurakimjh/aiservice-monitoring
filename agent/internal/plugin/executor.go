package plugin

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	// maxOutputSize is the maximum bytes we capture from a plugin's stdout.
	maxOutputSize = 4 * 1024 * 1024 // 4 MiB

	// defaultTimeout is used when the manifest does not specify a timeout.
	defaultTimeout = 60 * time.Second
)

// ExecuteScript runs a plugin's entrypoint script and returns the stdout output.
//
// Supported entrypoints (determined by file extension):
//
//	.sh   → bash (Linux/macOS)
//	.ps1  → PowerShell (Windows)
//	.py   → python3 / python
//	.bat  → cmd.exe /C (Windows)
//	other → direct execution (binary)
//
// The function enforces a timeout and caps output at maxOutputSize.
func ExecuteScript(ctx context.Context, entrypoint string, workDir string, timeout time.Duration, env map[string]string) ([]byte, error) {
	if timeout <= 0 {
		timeout = defaultTimeout
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	name, args := resolveCommand(entrypoint)
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = workDir

	// Build environment — inherit current env and overlay plugin-specific vars.
	if len(env) > 0 {
		cmdEnv := cmd.Environ()
		for k, v := range env {
			cmdEnv = append(cmdEnv, k+"="+v)
		}
		cmd.Env = cmdEnv
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &limitWriter{buf: &stdout, max: maxOutputSize}
	cmd.Stderr = &limitWriter{buf: &stderr, max: maxOutputSize}

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("plugin execution timed out after %s: %w", timeout, err)
		}
		stderrStr := strings.TrimSpace(stderr.String())
		if stderrStr != "" {
			return nil, fmt.Errorf("plugin execution failed: %s (stderr: %s)", err, stderrStr)
		}
		return nil, fmt.Errorf("plugin execution failed: %w", err)
	}

	return stdout.Bytes(), nil
}

// resolveCommand maps an entrypoint filename to the appropriate command and args.
func resolveCommand(entrypoint string) (string, []string) {
	ext := strings.ToLower(filepath.Ext(entrypoint))

	switch ext {
	case ".sh":
		return "bash", []string{entrypoint}
	case ".ps1":
		return "powershell", []string{"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", entrypoint}
	case ".py":
		python := "python3"
		if runtime.GOOS == "windows" {
			python = "python"
		}
		return python, []string{entrypoint}
	case ".bat", ".cmd":
		return "cmd", []string{"/C", entrypoint}
	default:
		// Direct binary execution.
		return entrypoint, nil
	}
}

// limitWriter wraps a bytes.Buffer and stops writing after max bytes.
type limitWriter struct {
	buf *bytes.Buffer
	max int
}

func (lw *limitWriter) Write(p []byte) (int, error) {
	remaining := lw.max - lw.buf.Len()
	if remaining <= 0 {
		return len(p), nil // discard silently
	}
	if len(p) > remaining {
		p = p[:remaining]
	}
	return lw.buf.Write(p)
}
