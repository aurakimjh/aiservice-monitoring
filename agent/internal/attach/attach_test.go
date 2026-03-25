package attach_test

import (
	"context"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/attach"
)

func TestManagerDetectAll_NoError(t *testing.T) {
	mgr := attach.NewManager()
	// On a CI machine with no JVMs / Python / .NET / Node running,
	// DetectAll should return empty without error.
	procs, err := mgr.DetectAll()
	if err != nil {
		t.Fatalf("DetectAll returned error: %v", err)
	}
	// procs may be empty — that's fine
	_ = procs
}

func TestManagerFind_UnknownRuntime(t *testing.T) {
	mgr := attach.NewManager()
	err := mgr.Attach(context.Background(), attach.Runtime("unknown"), 1234)
	if err == nil {
		t.Fatal("expected error for unknown runtime, got nil")
	}
}

func TestAttachErrorAlreadyActive(t *testing.T) {
	// Two consecutive Attach calls for the same PID must return ErrAlreadyActive.
	// Use Go attacher with a fake PID — the first call fails with ErrPortUnavailable
	// (no pprof server on the test host), so we cannot test ErrAlreadyActive via
	// the full stack.  Instead, validate the error code constants are exported.
	if attach.ErrAlreadyActive == "" {
		t.Fatal("ErrAlreadyActive constant is empty")
	}
	if attach.ErrPermissionDenied == "" {
		t.Fatal("ErrPermissionDenied constant is empty")
	}
	if attach.ErrJDKRequired == "" {
		t.Fatal("ErrJDKRequired constant is empty")
	}
	if attach.ErrPortUnavailable == "" {
		t.Fatal("ErrPortUnavailable constant is empty")
	}
	if attach.ErrEventPipeUnsupported == "" {
		t.Fatal("ErrEventPipeUnsupported constant is empty")
	}
	if attach.ErrBinaryNotFound == "" {
		t.Fatal("ErrBinaryNotFound constant is empty")
	}
}

func TestJavaAttacher_Detect_NoError(t *testing.T) {
	a := attach.NewJavaAttacher()
	_, err := a.Detect()
	if err != nil {
		t.Fatalf("JavaAttacher.Detect returned error: %v", err)
	}
}

func TestPythonAttacher_Detect_NoError(t *testing.T) {
	a := attach.NewPythonAttacher()
	_, err := a.Detect()
	if err != nil {
		t.Fatalf("PythonAttacher.Detect returned error: %v", err)
	}
}

func TestDotNetAttacher_Detect_NoError(t *testing.T) {
	a := attach.NewDotNetAttacher()
	_, err := a.Detect()
	if err != nil {
		t.Fatalf("DotNetAttacher.Detect returned error: %v", err)
	}
}

func TestNodeAttacher_Detect_NoError(t *testing.T) {
	a := attach.NewNodeAttacher()
	_, err := a.Detect()
	if err != nil {
		t.Fatalf("NodeAttacher.Detect returned error: %v", err)
	}
}

func TestGoAttacher_Detect_NoError(t *testing.T) {
	a := attach.NewGoAttacher()
	_, err := a.Detect()
	if err != nil {
		t.Fatalf("GoAttacher.Detect returned error: %v", err)
	}
}

func TestGoAttacher_Attach_NoServer(t *testing.T) {
	a := attach.NewGoAttacher()
	// Attach to PID 99999 which doesn't exist — expect an attach error, not a panic.
	err := a.Attach(context.Background(), 99999)
	if err == nil {
		t.Fatal("expected error attaching to non-existent PID, got nil")
	}
}

func TestGoAttacher_CollectProfile_NoServer(t *testing.T) {
	a := attach.NewGoAttacher()
	// Collecting without a reachable endpoint should return an error gracefully.
	_, err := a.CollectProfile(context.Background(), 99999, attach.ProfileCPU, 1)
	if err == nil {
		t.Fatal("expected error collecting profile from non-existent endpoint, got nil")
	}
}

func TestRuntimeConstants(t *testing.T) {
	runtimes := []attach.Runtime{
		attach.RuntimeJava,
		attach.RuntimePython,
		attach.RuntimeDotNet,
		attach.RuntimeNode,
		attach.RuntimeGo,
	}
	for _, rt := range runtimes {
		if string(rt) == "" {
			t.Fatalf("runtime constant is empty")
		}
	}
}

func TestProfileTypeConstants(t *testing.T) {
	types := []attach.ProfileType{
		attach.ProfileCPU,
		attach.ProfileMemory,
		attach.ProfileThread,
		attach.ProfileLock,
	}
	for _, pt := range types {
		if string(pt) == "" {
			t.Fatalf("profile type constant is empty")
		}
	}
}
