// Package transport provides the gRPC server for the Collection Server.
// It implements CollectionService, HeartbeatService, and ConfigService
// with mTLS authentication support.
package transport

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/eventbus"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/storage"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/validation"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// GRPCServerConfig holds gRPC server configuration.
type GRPCServerConfig struct {
	ListenAddr string `yaml:"listen_addr"` // e.g., ":50051"

	// mTLS settings
	TLSEnabled bool   `yaml:"tls_enabled"`
	CertFile   string `yaml:"cert_file"`   // server certificate
	KeyFile    string `yaml:"key_file"`    // server private key
	CAFile     string `yaml:"ca_file"`     // CA certificate for client verification
}

// GRPCServer is the Collection Server's gRPC endpoint.
// It handles agent registration, heartbeats, and collect result submission.
type GRPCServer struct {
	config    GRPCServerConfig
	registry  *AgentRegistry
	validator *validation.Gateway
	s3Client  *storage.S3Client
	eventBus  *eventbus.Bus

	listener net.Listener
	mu       sync.RWMutex
}

// AgentRegistry manages agent registration and authentication.
type AgentRegistry struct {
	mu     sync.RWMutex
	agents map[string]*RegisteredAgent
}

// RegisteredAgent holds registration data for an authenticated agent.
type RegisteredAgent struct {
	AgentID       string            `json:"agent_id"`
	Hostname      string            `json:"hostname"`
	OSType        string            `json:"os_type"`
	OSVersion     string            `json:"os_version"`
	AgentVersion  string            `json:"agent_version"`
	ProjectToken  string            `json:"-"` // not serialized
	Status        models.AgentStatus `json:"status"`
	Collectors    []string          `json:"collectors"`
	CertSerial    string            `json:"cert_serial,omitempty"`
	CertExpiresAt time.Time         `json:"cert_expires_at,omitempty"`
	RegisteredAt  time.Time         `json:"registered_at"`
	LastHeartbeat time.Time         `json:"last_heartbeat"`
}

// NewAgentRegistry creates a new agent registry.
func NewAgentRegistry() *AgentRegistry {
	return &AgentRegistry{
		agents: make(map[string]*RegisteredAgent),
	}
}

// Register adds or updates an agent in the registry.
// Returns the agent ID (generated if new).
func (r *AgentRegistry) Register(hostname, osType, osVersion, agentVersion, projectToken string, collectors []string) (*RegisteredAgent, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check if agent already registered by hostname
	for _, a := range r.agents {
		if a.Hostname == hostname {
			a.AgentVersion = agentVersion
			a.OSVersion = osVersion
			a.Collectors = collectors
			a.LastHeartbeat = time.Now()
			return a, false // existing
		}
	}

	// New registration
	agentID := fmt.Sprintf("agent-%s-%d", hostname, time.Now().UnixMilli()%10000)
	agent := &RegisteredAgent{
		AgentID:      agentID,
		Hostname:     hostname,
		OSType:       osType,
		OSVersion:    osVersion,
		AgentVersion: agentVersion,
		ProjectToken: projectToken,
		Status:       models.AgentRegistered,
		Collectors:   collectors,
		RegisteredAt: time.Now(),
		LastHeartbeat: time.Now(),
	}
	r.agents[agentID] = agent
	return agent, true // new
}

// Get returns a registered agent by ID.
func (r *AgentRegistry) Get(agentID string) (*RegisteredAgent, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.agents[agentID]
	return a, ok
}

// UpdateHeartbeat updates the agent's last heartbeat and status.
func (r *AgentRegistry) UpdateHeartbeat(agentID string, status models.AgentStatus) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	a, ok := r.agents[agentID]
	if !ok {
		return false
	}
	a.LastHeartbeat = time.Now()
	a.Status = status

	// Auto-approve registered agents
	if a.Status == models.AgentRegistered {
		a.Status = models.AgentApproved
	}
	return true
}

// List returns all registered agents.
func (r *AgentRegistry) List() []*RegisteredAgent {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*RegisteredAgent, 0, len(r.agents))
	for _, a := range r.agents {
		result = append(result, a)
	}
	return result
}

// Count returns the number of registered agents.
func (r *AgentRegistry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.agents)
}

// MarkOffline marks agents that haven't sent a heartbeat recently as offline.
func (r *AgentRegistry) MarkOffline(timeout time.Duration) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	count := 0
	cutoff := time.Now().Add(-timeout)
	for _, a := range r.agents {
		if a.Status != models.AgentOffline && a.Status != models.AgentRetired {
			if a.LastHeartbeat.Before(cutoff) {
				a.Status = models.AgentOffline
				count++
			}
		}
	}
	return count
}

// NewGRPCServer creates a new gRPC server instance.
func NewGRPCServer(cfg GRPCServerConfig, s3 *storage.S3Client, bus *eventbus.Bus) *GRPCServer {
	return &GRPCServer{
		config:    cfg,
		registry:  NewAgentRegistry(),
		validator: validation.NewGateway(),
		s3Client:  s3,
		eventBus:  bus,
	}
}

// LoadTLSConfig creates a TLS configuration for mTLS.
func (s *GRPCServer) LoadTLSConfig() (*tls.Config, error) {
	if !s.config.TLSEnabled {
		return nil, nil
	}

	// Load server certificate
	cert, err := tls.LoadX509KeyPair(s.config.CertFile, s.config.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("load server cert: %w", err)
	}

	// Load CA certificate for client verification
	caCert, err := os.ReadFile(s.config.CAFile)
	if err != nil {
		return nil, fmt.Errorf("read CA cert: %w", err)
	}

	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    caPool,
		MinVersion:   tls.VersionTLS13,
	}, nil
}

// HandleRegister processes an agent registration request.
func (s *GRPCServer) HandleRegister(ctx context.Context, hostname, osType, osVersion, agentVersion, projectToken string, collectors []string) (*RegisteredAgent, bool, error) {
	agent, isNew := s.registry.Register(hostname, osType, osVersion, agentVersion, projectToken, collectors)

	if isNew {
		log.Printf("[gRPC] agent registered: id=%s hostname=%s", agent.AgentID, hostname)
		s.eventBus.Publish(eventbus.Event{
			Type:    eventbus.EventAgentRegistered,
			AgentID: agent.AgentID,
			Data: map[string]interface{}{
				"hostname":      hostname,
				"os_type":       osType,
				"agent_version": agentVersion,
			},
		})
	}

	return agent, isNew, nil
}

// HandleHeartbeat processes a heartbeat from an agent.
func (s *GRPCServer) HandleHeartbeat(agentID string, status models.AgentStatus) (*models.HeartbeatResponse, error) {
	if !s.registry.UpdateHeartbeat(agentID, status) {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	s.eventBus.Publish(eventbus.Event{
		Type:    eventbus.EventAgentHeartbeat,
		AgentID: agentID,
		Data: map[string]interface{}{
			"status": string(status),
		},
	})

	return &models.HeartbeatResponse{}, nil
}

// HandleCollectResult validates, stores, and publishes a collect result.
func (s *GRPCServer) HandleCollectResult(agentID, collectorID string, data []byte, collectedAt time.Time) (string, error) {
	// 1. Validate
	result, sanitizedData := s.validator.Validate(data)
	if result.Status == validation.StatusRejected {
		return "", fmt.Errorf("validation rejected: %v", result.Errors)
	}

	// Generate result ID
	resultID := fmt.Sprintf("cr-%s-%s-%d", agentID, collectorID, time.Now().UnixMilli())

	// 2. Store in S3
	if s.s3Client != nil && sanitizedData != nil {
		s3Key := storage.EvidenceKey(agentID, collectorID, resultID, collectedAt)
		checksum, size, err := s.s3Client.PutObject(s3Key, sanitizedData)
		if err != nil {
			log.Printf("[gRPC] S3 store failed (will retry): %v", err)
		} else {
			log.Printf("[gRPC] evidence stored: key=%s checksum=%s size=%d", s3Key, checksum[:8], size)
		}
	}

	// 3. Publish event
	eventType := eventbus.EventCollectCompleted
	if result.Status == validation.StatusQuarantined {
		eventType = eventbus.EventCollectQuarantined
	}

	s.eventBus.Publish(eventbus.Event{
		Type:    eventType,
		AgentID: agentID,
		Data: map[string]interface{}{
			"result_id":    resultID,
			"collector_id": collectorID,
			"sanitized":    result.Sanitized,
			"warnings":     result.Warnings,
		},
	})

	return resultID, nil
}

// Registry returns the agent registry for external access.
func (s *GRPCServer) Registry() *AgentRegistry {
	return s.registry
}

// ToJSON serializes data for logging/debugging.
func ToJSON(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}
