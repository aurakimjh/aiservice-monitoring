package mq

// Collector gathers metrics from message queues.
// Supported: Kafka, RabbitMQ, ActiveMQ.

import (
	"context"
	"net"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector implements the models.Collector interface for message queue systems.
type Collector struct{}

// New returns a new MQ Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "it-mq" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{}
}

func (c *Collector) OutputSchemas() []string {
	return []string{"mq.broker.v1", "mq.topic.v1", "mq.consumer.v1"}
}

// mqCandidate represents a potential message queue endpoint to probe.
type mqCandidate struct {
	mqType string
	host   string
	port   string
}

// defaultMQCandidates lists the default ports used by supported MQ systems.
var defaultMQCandidates = []mqCandidate{
	{mqType: "kafka", host: "127.0.0.1", port: "9092"},
	{mqType: "rabbitmq", host: "127.0.0.1", port: "5672"},
	{mqType: "activemq", host: "127.0.0.1", port: "61616"},
}

// AutoDetect checks whether any supported message queue is reachable on standard ports.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	for _, cand := range defaultMQCandidates {
		if isPortOpen(cand.host, cand.port) {
			return models.DetectResult{
				Detected: true,
				Details: map[string]string{
					"mq_type": cand.mqType,
					"host":    cand.host,
					"port":    cand.port,
				},
			}, nil
		}
	}
	return models.DetectResult{Detected: false}, nil
}

// Collect runs the message queue metric collection.
// TODO: implement Kafka broker metadata retrieval, RabbitMQ management API,
// and ActiveMQ JMX/REST collection.
func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
		Items:            []models.CollectedItem{},
		Errors:           []models.CollectError{},
	}
	result.Duration = time.Since(start)
	return result, nil
}

// isPortOpen checks if a TCP port is accepting connections.
func isPortOpen(host, port string) bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 2*time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
