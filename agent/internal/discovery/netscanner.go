// Package discovery provides network-based service topology auto-discovery.
// It scans /proc/net/tcp to detect inter-service connections and build
// a dependency graph with protocol detection.
package discovery

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Connection represents an active TCP connection between two services.
type Connection struct {
	LocalAddr    string `json:"local_addr"`
	LocalPort    int    `json:"local_port"`
	RemoteAddr   string `json:"remote_addr"`
	RemotePort   int    `json:"remote_port"`
	LocalPID     int    `json:"local_pid,omitempty"`
	LocalService string `json:"local_service,omitempty"`
	Protocol     string `json:"protocol"` // http, grpc, sql, redis, kafka, unknown
	State        string `json:"state"`    // ESTABLISHED, LISTEN, etc.
}

// ScanResult holds the results of a network topology scan.
type ScanResult struct {
	Connections []Connection `json:"connections"`
	Services    []string     `json:"services"`
	ScanTimeMS  int64        `json:"scan_time_ms"`
}

// ScanTCPConnections reads /proc/net/tcp and /proc/net/tcp6 to discover active connections.
func ScanTCPConnections() ([]Connection, error) {
	var conns []Connection

	for _, path := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		entries, err := parseProcNetTCP(path)
		if err != nil {
			continue // Skip if not available (e.g., non-Linux)
		}
		conns = append(conns, entries...)
	}

	// Detect protocols based on well-known ports
	for i := range conns {
		conns[i].Protocol = detectProtocol(conns[i].RemotePort)
	}

	return conns, nil
}

// parseProcNetTCP parses a /proc/net/tcp or tcp6 file.
func parseProcNetTCP(path string) ([]Connection, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var conns []Connection
	scanner := bufio.NewScanner(f)
	scanner.Scan() // Skip header line

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		localAddr, localPort := parseHexAddr(fields[1])
		remoteAddr, remotePort := parseHexAddr(fields[2])
		state := parseState(fields[3])

		// Only interested in ESTABLISHED connections
		if state != "ESTABLISHED" {
			continue
		}

		conns = append(conns, Connection{
			LocalAddr:  localAddr,
			LocalPort:  localPort,
			RemoteAddr: remoteAddr,
			RemotePort: remotePort,
			State:      state,
		})
	}

	return conns, scanner.Err()
}

// parseHexAddr converts hex-encoded address:port from /proc/net/tcp.
func parseHexAddr(hexAddrPort string) (string, int) {
	parts := strings.Split(hexAddrPort, ":")
	if len(parts) != 2 {
		return "", 0
	}

	// Parse port
	port, _ := strconv.ParseInt(parts[1], 16, 32)

	// Parse address (little-endian for IPv4)
	addrHex := parts[0]
	if len(addrHex) == 8 {
		// IPv4
		addrBytes, err := hex.DecodeString(addrHex)
		if err != nil || len(addrBytes) != 4 {
			return "", int(port)
		}
		// Reverse byte order (little-endian)
		ip := net.IPv4(addrBytes[3], addrBytes[2], addrBytes[1], addrBytes[0])
		return ip.String(), int(port)
	}

	// IPv6 (32 hex chars)
	if len(addrHex) == 32 {
		addrBytes, err := hex.DecodeString(addrHex)
		if err != nil || len(addrBytes) != 16 {
			return "", int(port)
		}
		ip := net.IP(addrBytes)
		return ip.String(), int(port)
	}

	return addrHex, int(port)
}

// parseState converts hex state code to string.
func parseState(hexState string) string {
	states := map[string]string{
		"01": "ESTABLISHED",
		"02": "SYN_SENT",
		"03": "SYN_RECV",
		"04": "FIN_WAIT1",
		"05": "FIN_WAIT2",
		"06": "TIME_WAIT",
		"07": "CLOSE",
		"08": "CLOSE_WAIT",
		"09": "LAST_ACK",
		"0A": "LISTEN",
		"0B": "CLOSING",
	}
	if s, ok := states[strings.ToUpper(hexState)]; ok {
		return s
	}
	return "UNKNOWN"
}

// detectProtocol guesses the protocol from the remote port number.
func detectProtocol(port int) string {
	switch {
	case port == 80 || port == 443 || port == 8080 || port == 8443 || port == 3000 || port == 8000:
		return "http"
	case port == 50051 || port == 50052 || port == 9090:
		return "grpc"
	case port == 3306 || port == 5432 || port == 1521 || port == 1433:
		return "sql"
	case port == 6379 || port == 6380:
		return "redis"
	case port == 9092 || port == 9093:
		return "kafka"
	case port == 27017:
		return "sql" // MongoDB
	default:
		return "unknown"
	}
}

// MapPIDToService maps a process PID to its service name using /proc/{pid}/cmdline.
func MapPIDToService(pid int) string {
	cmdlineFile := fmt.Sprintf("/proc/%d/cmdline", pid)
	data, err := os.ReadFile(cmdlineFile)
	if err != nil {
		return ""
	}
	cmdline := strings.ReplaceAll(string(data), "\x00", " ")
	parts := strings.Fields(cmdline)
	if len(parts) == 0 {
		return ""
	}
	return filepath.Base(parts[0])
}
