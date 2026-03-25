// Package script provides a safe, cross-platform script executor for
// Phase 31-2a (Script Executor). It supports .sh, .ps1, and .py scripts
// with timeout, stderr capture, and optional resource limits.
package script

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

// ScriptType classifies the script file type.
type ScriptType string

const (
	TypeShell      ScriptType = "sh"
	TypePowerShell ScriptType = "ps1"
	TypePython     ScriptType = "py"
	TypeUnknown    ScriptType = ""
)

// ExecuteResult is the result of running a script.
type ExecuteResult struct {
	// ScriptPath is the resolved path of the script that ran.
	ScriptPath string `json:"script_path"`
	// ExitCode is the process exit code (0 = success).
	ExitCode int `json:"exit_code"`
	// Stdout contains the standard output (trimmed to MaxOutputBytes).
	Stdout string `json:"stdout,omitempty"`
	// Stderr contains the standard error output.
	Stderr string `json:"stderr,omitempty"`
	// Duration is how long the script ran.
	Duration time.Duration `json:"duration_ms"`
	// TimedOut is true if the script was killed due to timeout.
	TimedOut bool `json:"timed_out,omitempty"`
	// Error holds any execution-level error (not script exit code).
	Error string `json:"error,omitempty"`
}

// Config configures the Script Executor.
type Config struct {
	// Timeout is the maximum execution duration. 0 = 5 minutes default.
	Timeout time.Duration
	// MaxOutputBytes caps the stdout/stderr captured. 0 = 1 MiB default.
	MaxOutputBytes int
	// Env holds extra environment variables (KEY=VALUE format).
	Env []string
	// WorkDir is the working directory. "" uses system temp dir.
	WorkDir string
}

const (
	defaultTimeout     = 5 * time.Minute
	defaultMaxOutput   = 1 * 1024 * 1024 // 1 MiB
)

// Executor runs diagnostic scripts safely.
type Executor struct {
	cfg Config
}

// New creates an Executor with the given config.
func New(cfg Config) *Executor {
	if cfg.Timeout == 0 {
		cfg.Timeout = defaultTimeout
	}
	if cfg.MaxOutputBytes == 0 {
		cfg.MaxOutputBytes = defaultMaxOutput
	}
	return &Executor{cfg: cfg}
}

// Execute runs the script at path with an execution-scoped context.
// A context deadline shorter than cfg.Timeout takes priority.
func (e *Executor) Execute(ctx context.Context, scriptPath string) ExecuteResult {
	start := time.Now()
	result := ExecuteResult{ScriptPath: scriptPath}

	// Apply our own timeout on top of any parent deadline.
	execCtx, cancel := context.WithTimeout(ctx, e.cfg.Timeout)
	defer cancel()

	scriptType := detectScriptType(scriptPath)
	cmd, err := buildCommand(execCtx, scriptPath, scriptType, e.cfg)
	if err != nil {
		result.Error = err.Error()
		result.Duration = time.Since(start)
		return result
	}

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &limitWriter{buf: &stdoutBuf, limit: e.cfg.MaxOutputBytes}
	cmd.Stderr = &limitWriter{buf: &stderrBuf, limit: e.cfg.MaxOutputBytes}

	if err := cmd.Run(); err != nil {
		if execCtx.Err() == context.DeadlineExceeded {
			result.TimedOut = true
			result.Error = fmt.Sprintf("script timed out after %s", e.cfg.Timeout)
		} else if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else {
			result.Error = err.Error()
		}
	}

	result.Stdout = stdoutBuf.String()
	result.Stderr = stderrBuf.String()
	result.Duration = time.Since(start)
	return result
}

// detectScriptType infers the script type from the file extension.
func detectScriptType(path string) ScriptType {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".sh", ".bash":
		return TypeShell
	case ".ps1":
		return TypePowerShell
	case ".py":
		return TypePython
	default:
		return TypeUnknown
	}
}

// buildCommand builds the exec.Cmd for the given script type.
func buildCommand(ctx context.Context, scriptPath string, st ScriptType, cfg Config) (*exec.Cmd, error) {
	var cmd *exec.Cmd

	switch st {
	case TypeShell:
		if runtime.GOOS == "windows" {
			// Use Git Bash or WSL if available; fall through to error.
			bash, err := exec.LookPath("bash")
			if err != nil {
				return nil, fmt.Errorf("bash not found on Windows; install Git for Windows or WSL")
			}
			cmd = exec.CommandContext(ctx, bash, scriptPath)
		} else {
			cmd = exec.CommandContext(ctx, "/bin/sh", scriptPath)
		}
	case TypePowerShell:
		ps, err := findPowerShell()
		if err != nil {
			return nil, err
		}
		cmd = exec.CommandContext(ctx, ps,
			"-NonInteractive", "-NoProfile",
			"-ExecutionPolicy", "Bypass",
			"-File", scriptPath)
	case TypePython:
		py, err := findPython()
		if err != nil {
			return nil, err
		}
		cmd = exec.CommandContext(ctx, py, scriptPath)
	default:
		// Try executing directly (relies on shebang line).
		cmd = exec.CommandContext(ctx, scriptPath)
	}

	if cfg.WorkDir != "" {
		cmd.Dir = cfg.WorkDir
	}
	cmd.Env = append(cmd.Env, cfg.Env...)
	return cmd, nil
}

func findPowerShell() (string, error) {
	for _, name := range []string{"pwsh", "powershell"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("powershell (pwsh/powershell) not found in PATH")
}

func findPython() (string, error) {
	for _, name := range []string{"python3", "python"} {
		if path, err := exec.LookPath(name); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("python3/python not found in PATH")
}

// ─── limitWriter caps the amount of bytes written to an underlying buffer ─────

type limitWriter struct {
	buf   *bytes.Buffer
	limit int
}

func (w *limitWriter) Write(p []byte) (int, error) {
	remaining := w.limit - w.buf.Len()
	if remaining <= 0 {
		return len(p), nil // silently drop
	}
	if len(p) > remaining {
		p = p[:remaining]
	}
	return w.buf.Write(p)
}
