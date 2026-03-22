package was

import (
	"context"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

func TestWASCollectorInterface(t *testing.T) {
	c := New()
	if c.ID() != "was" {
		t.Errorf("expected ID 'was', got %q", c.ID())
	}
	if c.Version() == "" {
		t.Error("Version() must not be empty")
	}
	if len(c.SupportedPlatforms()) == 0 {
		t.Error("SupportedPlatforms() must not be empty")
	}
	if len(c.OutputSchemas()) == 0 {
		t.Error("OutputSchemas() must not be empty")
	}
}

func TestAutoDetect_NoWAS(t *testing.T) {
	c := New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	_ = result.Detected
}

func TestCollect_NoWAS(t *testing.T) {
	c := New()
	result, err := c.Collect(context.Background(), models.CollectConfig{Hostname: "test"})
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if result.CollectorID != "was" {
		t.Errorf("expected CollectorID 'was', got %q", result.CollectorID)
	}
}

func TestParseMemoryMB(t *testing.T) {
	cases := []struct {
		input    string
		expected int
	}{
		{"512m", 512},
		{"2g", 2048},
		{"1024k", 1},
		{"256M", 256},
		{"4G", 4096},
	}
	for _, tc := range cases {
		got := parseMemoryMB(tc.input)
		if got != tc.expected {
			t.Errorf("parseMemoryMB(%q) = %d, want %d", tc.input, got, tc.expected)
		}
	}
}

func TestParseMemoryKB(t *testing.T) {
	cases := []struct {
		input    string
		expected int
	}{
		{"512k", 512},
		{"1m", 1024},
		{"1g", 1048576},
	}
	for _, tc := range cases {
		got := parseMemoryKB(tc.input)
		if got != tc.expected {
			t.Errorf("parseMemoryKB(%q) = %d, want %d", tc.input, got, tc.expected)
		}
	}
}

func TestClassifyJavaProcess(t *testing.T) {
	cases := []struct {
		cmdline  []string
		expected string
	}{
		{[]string{"java", "-jar", "spring-boot-app.jar", "org.springframework.boot.loader.JarLauncher"}, "spring-boot"},
		{[]string{"java", "-classpath", "/opt/tomcat/bin/bootstrap.jar", "org.apache.catalina.startup.Bootstrap"}, "tomcat"},
		{[]string{"java", "-Djboss.home=/opt/jboss", "org.jboss.Main"}, "jboss"},
		{[]string{"python3", "app.py"}, ""},
	}
	for _, tc := range cases {
		got := classifyJavaProcess(tc.cmdline)
		if got != tc.expected {
			t.Errorf("classifyJavaProcess(%v) = %q, want %q", tc.cmdline, got, tc.expected)
		}
	}
}

func TestExtractPauseMs(t *testing.T) {
	cases := []struct {
		line     string
		expected float64
	}{
		{"[0.123s][info][gc] GC(1) Pause Young 32.5ms", 32.5},
		{"2024-01-01T00:00:00: [GC ... 0.002 secs]", 2.0},
		{"[info] no gc here", 0},
	}
	for _, tc := range cases {
		got := extractPauseMs(tc.line)
		if got != tc.expected {
			t.Errorf("extractPauseMs(%q) = %v, want %v", tc.line, got, tc.expected)
		}
	}
}

func TestCollectJVMSettings_Parsing(t *testing.T) {
	c := New()
	proc := wasProcess{
		Name: "spring-boot",
		PID:  12345,
		CmdLine: []string{
			"java",
			"-Xms512m",
			"-Xmx2g",
			"-Xss256k",
			"-XX:+UseG1GC",
			"-Xlog:gc:file=/var/log/app/gc.log",
			"-Dcom.sun.management.jmxremote.port=9999",
			"-Dspring.application.name=myapp",
			"-Djava.awt.headless=true",
		},
	}
	item, err := c.collectJVMSettings(proc)
	if err != nil {
		t.Fatalf("collectJVMSettings returned error: %v", err)
	}
	settings, ok := item.Data.(JVMSettings)
	if !ok {
		t.Fatalf("expected JVMSettings data, got %T", item.Data)
	}
	if settings.HeapInitMB != 512 {
		t.Errorf("expected HeapInitMB=512, got %d", settings.HeapInitMB)
	}
	if settings.HeapMaxMB != 2048 {
		t.Errorf("expected HeapMaxMB=2048, got %d", settings.HeapMaxMB)
	}
	if settings.GCType != "G1GC" {
		t.Errorf("expected GCType=G1GC, got %q", settings.GCType)
	}
	if !settings.JMXEnabled {
		t.Error("expected JMXEnabled=true")
	}
	if settings.JMXPort != "9999" {
		t.Errorf("expected JMXPort=9999, got %q", settings.JMXPort)
	}
}
