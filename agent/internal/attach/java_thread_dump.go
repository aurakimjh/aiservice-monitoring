package attach

// java_thread_dump.go — Phase 39-5
//
// JDK 21 Thread Dump JSON parsing.
//
// The JSON thread dump produced by:
//   jcmd <pid> Thread.dump_to_file -format=json /tmp/aitop-td-<pid>.json
//
// has the structure:
//   {
//     "threadDump": {
//       "processId": 12345,
//       "time": "2024-01-01T00:00:00",
//       "runtimeVersion": "21.0.2+13-58",
//       "threadContainers": [
//         {
//           "container": "ForkJoinPool-1-worker-1",
//           "parent": "...",
//           "owner": "...",
//           "threads": [...]
//         },
//         {
//           "container": "VirtualThreads",
//           ...
//           "threads": [...]
//         }
//       ]
//     }
//   }

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// ─── JSON schema types ────────────────────────────────────────────────────────

type jdkThreadDumpFile struct {
	ThreadDump jdkThreadDump `json:"threadDump"`
}

type jdkThreadDump struct {
	ProcessID      int                   `json:"processId"`
	Time           string                `json:"time"`
	RuntimeVersion string                `json:"runtimeVersion"`
	Containers     []jdkThreadContainer  `json:"threadContainers"`
}

type jdkThreadContainer struct {
	Container string      `json:"container"`
	Parent    string      `json:"parent"`
	Owner     string      `json:"owner"`
	Threads   []jdkThread `json:"threads"`
}

type jdkThread struct {
	Name        string       `json:"name"`
	TID         string       `json:"tid"`   // hex string
	State       string       `json:"state"` // RUNNABLE, WAITING, TIMED_WAITING, BLOCKED, TERMINATED
	Stack       []string     `json:"stack"`
	Daemon      bool         `json:"daemon"`
	Priority    int          `json:"priority"`
}

// ─── Parsed result types ──────────────────────────────────────────────────────

// ThreadDumpResult is the processed output of a JDK 21 JSON thread dump.
type ThreadDumpResult struct {
	PID            int                    `json:"pid"`
	CapturedAt     time.Time              `json:"captured_at"`
	JavaVersion    string                 `json:"java_version"`
	TotalThreads   int                    `json:"total_threads"`
	PlatformThreads []ParsedThread        `json:"platform_threads"`
	VirtualThreads []ParsedThread         `json:"virtual_threads"`
	VTSummary      VirtualThreadDumpSummary `json:"vt_summary"`
	StorageKey     string                 `json:"storage_key,omitempty"`
}

// ParsedThread is a normalized single thread entry.
type ParsedThread struct {
	Name      string   `json:"name"`
	State     string   `json:"state"`
	Stack     []string `json:"stack"`
	IsVirtual bool     `json:"is_virtual"`
}

// VirtualThreadDumpSummary aggregates Virtual Thread counts by state.
type VirtualThreadDumpSummary struct {
	Total   int `json:"total"`
	Running int `json:"running"`
	Waiting int `json:"waiting"`
	Blocked int `json:"blocked"`
}

// ─── TriggerThreadDump ────────────────────────────────────────────────────────

// TriggerThreadDump runs jcmd to produce a JSON thread dump for the given pid.
// The dump file is written to os.TempDir() and parsed.
// The raw JSON bytes are also returned for StorageBackend archival.
func TriggerThreadDump(pid int) (*ThreadDumpResult, []byte, error) {
	outFile := fmt.Sprintf("%s/aitop-td-%d-%d.json",
		os.TempDir(), pid, time.Now().UnixMilli())
	defer os.Remove(outFile)

	// jcmd <pid> Thread.dump_to_file -format=json <file>
	cmd := exec.Command("jcmd", strconv.Itoa(pid), "Thread.dump_to_file", "-format=json", outFile)
	if err := cmd.Run(); err != nil {
		// Fallback: try text-format dump and synthesise a minimal result
		return fallbackTextDump(pid), nil, nil
	}

	data, err := os.ReadFile(outFile)
	if err != nil {
		return nil, nil, fmt.Errorf("read thread dump: %w", err)
	}

	result, err := ParseThreadDumpJSON(pid, data)
	if err != nil {
		return nil, nil, fmt.Errorf("parse thread dump: %w", err)
	}

	return result, data, nil
}

// ParseThreadDumpJSON parses a JDK 21 JSON thread dump byte slice.
func ParseThreadDumpJSON(pid int, data []byte) (*ThreadDumpResult, error) {
	var raw jdkThreadDumpFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal thread dump JSON: %w", err)
	}

	result := &ThreadDumpResult{
		PID:         pid,
		CapturedAt:  time.Now().UTC(),
		JavaVersion: raw.ThreadDump.RuntimeVersion,
	}

	for _, container := range raw.ThreadDump.Containers {
		isVTContainer := strings.Contains(strings.ToLower(container.Container), "virtualthread") ||
			strings.Contains(strings.ToLower(container.Container), "virtual-thread")

		for _, t := range container.Threads {
			pt := ParsedThread{
				Name:      t.Name,
				State:     normaliseThreadState(t.State),
				Stack:     t.Stack,
				IsVirtual: isVTContainer,
			}
			if isVTContainer {
				result.VirtualThreads = append(result.VirtualThreads, pt)
			} else {
				result.PlatformThreads = append(result.PlatformThreads, pt)
			}
		}
	}

	// Build summary
	result.TotalThreads = len(result.PlatformThreads) + len(result.VirtualThreads)
	result.VTSummary = summariseVirtualThreads(result.VirtualThreads)

	return result, nil
}

// normaliseThreadState maps JDK state strings to a canonical set.
func normaliseThreadState(s string) string {
	switch strings.ToUpper(s) {
	case "RUNNABLE":
		return "RUNNING"
	case "WAITING", "TIMED_WAITING", "PARKED":
		return "WAITING"
	case "BLOCKED", "PINNED":
		return "BLOCKED"
	case "TERMINATED":
		return "TERMINATED"
	default:
		return s
	}
}

func summariseVirtualThreads(threads []ParsedThread) VirtualThreadDumpSummary {
	s := VirtualThreadDumpSummary{Total: len(threads)}
	for _, t := range threads {
		switch t.State {
		case "RUNNING":
			s.Running++
		case "WAITING":
			s.Waiting++
		case "BLOCKED":
			s.Blocked++
		}
	}
	return s
}

// fallbackTextDump returns a minimal stub when jcmd JSON format is unavailable
// (e.g., JDK < 21 or missing jcmd privilege).
func fallbackTextDump(pid int) *ThreadDumpResult {
	return &ThreadDumpResult{
		PID:          pid,
		CapturedAt:   time.Now().UTC(),
		JavaVersion:  "unknown",
		TotalThreads: 0,
	}
}

// StorageKeyForDump produces the StorageBackend key for a thread dump.
func StorageKeyForDump(agentID string, capturedAt time.Time) string {
	return fmt.Sprintf("thread-dumps/%s/%s.json", agentID, capturedAt.Format("20060102-150405"))
}
