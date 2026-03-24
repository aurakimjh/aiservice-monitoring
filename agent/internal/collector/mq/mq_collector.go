package mq

// Collector gathers metrics from message queues.
// Supported: Kafka, RabbitMQ, ActiveMQ.

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
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

// KafkaMetrics holds broker and topic metadata from a Kafka cluster.
type KafkaMetrics struct {
	Host        string           `json:"host"`
	Port        string           `json:"port"`
	BrokerCount int              `json:"broker_count"`
	TopicCount  int              `json:"topic_count"`
	Brokers     []KafkaBroker    `json:"brokers"`
	Topics      []KafkaTopicInfo `json:"topics"`
}

// KafkaBroker represents a single Kafka broker node.
type KafkaBroker struct {
	NodeID int32  `json:"node_id"`
	Host   string `json:"host"`
	Port   int32  `json:"port"`
}

// KafkaTopicInfo represents basic topic metadata.
type KafkaTopicInfo struct {
	Name           string `json:"name"`
	PartitionCount int    `json:"partition_count"`
}

// RabbitMQMetrics holds metrics from the RabbitMQ Management API.
type RabbitMQMetrics struct {
	Host            string  `json:"host"`
	Port            string  `json:"port"`
	Version         string  `json:"rabbitmq_version"`
	ClusterName     string  `json:"cluster_name"`
	QueueCount      int     `json:"queue_count"`
	ConnectionCount int     `json:"connection_count"`
	ChannelCount    int     `json:"channel_count"`
	ExchangeCount   int     `json:"exchange_count"`
	ConsumerCount   int     `json:"consumer_count"`
	MessageCount    int64   `json:"message_count"`
	MessagesReady   int64   `json:"messages_ready"`
	MessagesUnacked int64   `json:"messages_unacknowledged"`
	PublishRate     float64 `json:"publish_rate"`
	DeliverRate     float64 `json:"deliver_rate"`
}

// ActiveMQMetrics holds metrics from the ActiveMQ Jolokia REST API.
type ActiveMQMetrics struct {
	Host             string  `json:"host"`
	Port             string  `json:"port"`
	BrokerName       string  `json:"broker_name"`
	UptimeMillis     int64   `json:"uptime_millis"`
	TotalConnections int64   `json:"total_connections"`
	TotalConsumers   int64   `json:"total_consumers"`
	TotalProducers   int64   `json:"total_producers"`
	TotalQueues      int64   `json:"total_queues"`
	TotalTopics      int64   `json:"total_topics"`
	TotalEnqueued    int64   `json:"total_enqueued"`
	TotalDequeued    int64   `json:"total_dequeued"`
	StoreUsagePct    float64 `json:"store_percent_usage"`
	MemoryUsagePct   float64 `json:"memory_percent_usage"`
}

// defaultMgmtPorts maps MQ types to their management/API ports.
var defaultMgmtPorts = map[string]string{
	"rabbitmq": "15672",
	"activemq": "8161",
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
// Supports Kafka (binary Metadata API), RabbitMQ (Management HTTP API), ActiveMQ (Jolokia REST).
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

	targets := resolveTargets(cfg)
	if len(targets) == 0 {
		result.Status = models.StatusSkipped
		result.Duration = time.Since(start)
		return result, nil
	}

	for _, t := range targets {
		switch t.mqType {
		case "kafka":
			collectKafka(t, result)
		case "rabbitmq":
			collectRabbitMQ(t, cfg, result)
		case "activemq":
			collectActiveMQ(t, cfg, result)
		}
	}

	if len(result.Items) == 0 && len(result.Errors) > 0 {
		result.Status = models.StatusFailed
	} else if len(result.Errors) > 0 {
		result.Status = models.StatusPartial
	}

	result.Duration = time.Since(start)
	return result, nil
}

// resolveTargets returns MQ endpoints to collect from, using cfg.Extra or auto-detection.
func resolveTargets(cfg models.CollectConfig) []mqCandidate {
	if cfg.Extra != nil {
		if mqType, ok := cfg.Extra["mq_type"]; ok {
			host := cfg.Extra["host"]
			port := cfg.Extra["port"]
			if host == "" {
				host = "127.0.0.1"
			}
			if port == "" {
				for _, c := range defaultMQCandidates {
					if c.mqType == mqType {
						port = c.port
						break
					}
				}
			}
			return []mqCandidate{{mqType: mqType, host: host, port: port}}
		}
	}
	var targets []mqCandidate
	for _, cand := range defaultMQCandidates {
		if isPortOpen(cand.host, cand.port) {
			targets = append(targets, cand)
		}
	}
	return targets
}

// --- Kafka: binary Metadata API v0 ---

func collectKafka(t mqCandidate, result *models.CollectResult) {
	addr := net.JoinHostPort(t.host, t.port)
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("connect to kafka %s: %v", addr, err),
		})
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))

	metrics, err := kafkaMetadata(conn, t)
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("kafka metadata from %s: %v", addr, err),
		})
		return
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "mq.broker.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})
}

// kafkaMetadata sends a Metadata Request v0 and parses the response.
func kafkaMetadata(conn net.Conn, t mqCandidate) (KafkaMetrics, error) {
	clientID := "aitop"

	// Build request: size(4) + api_key(2) + api_version(2) + correlation_id(4) + client_id_len(2) + client_id + topic_count(4)
	headerSize := 2 + 2 + 4 + 2 + len(clientID)
	bodySize := 4
	totalSize := headerSize + bodySize

	buf := make([]byte, 4+totalSize)
	off := 0
	binary.BigEndian.PutUint32(buf[off:], uint32(totalSize))
	off += 4
	binary.BigEndian.PutUint16(buf[off:], 3) // API Key: Metadata
	off += 2
	binary.BigEndian.PutUint16(buf[off:], 0) // API Version: 0
	off += 2
	binary.BigEndian.PutUint32(buf[off:], 1) // Correlation ID
	off += 4
	binary.BigEndian.PutUint16(buf[off:], uint16(len(clientID)))
	off += 2
	copy(buf[off:], clientID)
	off += len(clientID)
	binary.BigEndian.PutUint32(buf[off:], 0) // Topic count: 0 = all

	if _, err := conn.Write(buf); err != nil {
		return KafkaMetrics{}, fmt.Errorf("write metadata request: %w", err)
	}

	// Read response size
	var respSize int32
	if err := binary.Read(conn, binary.BigEndian, &respSize); err != nil {
		return KafkaMetrics{}, fmt.Errorf("read response size: %w", err)
	}
	if respSize <= 0 || respSize > 10*1024*1024 {
		return KafkaMetrics{}, fmt.Errorf("invalid response size: %d", respSize)
	}

	resp := make([]byte, respSize)
	if _, err := io.ReadFull(conn, resp); err != nil {
		return KafkaMetrics{}, fmt.Errorf("read response body: %w", err)
	}

	return parseKafkaMetadataResp(resp, t)
}

// parseKafkaMetadataResp parses the binary Kafka Metadata Response v0.
func parseKafkaMetadataResp(data []byte, t mqCandidate) (KafkaMetrics, error) {
	m := KafkaMetrics{Host: t.host, Port: t.port}
	pos := 4 // skip correlation_id

	// Brokers
	if pos+4 > len(data) {
		return m, fmt.Errorf("truncated broker count")
	}
	brokerCount := int(binary.BigEndian.Uint32(data[pos:]))
	pos += 4
	m.BrokerCount = brokerCount

	for i := 0; i < brokerCount; i++ {
		if pos+4 > len(data) {
			break
		}
		nodeID := int32(binary.BigEndian.Uint32(data[pos:]))
		pos += 4

		if pos+2 > len(data) {
			break
		}
		hostLen := int(binary.BigEndian.Uint16(data[pos:]))
		pos += 2
		if pos+hostLen > len(data) {
			break
		}
		host := string(data[pos : pos+hostLen])
		pos += hostLen

		if pos+4 > len(data) {
			break
		}
		port := int32(binary.BigEndian.Uint32(data[pos:]))
		pos += 4

		m.Brokers = append(m.Brokers, KafkaBroker{NodeID: nodeID, Host: host, Port: port})
	}

	// Topics
	if pos+4 > len(data) {
		return m, nil
	}
	topicCount := int(binary.BigEndian.Uint32(data[pos:]))
	pos += 4
	m.TopicCount = topicCount

	for i := 0; i < topicCount; i++ {
		if pos+2 > len(data) {
			break
		}
		pos += 2 // error_code

		if pos+2 > len(data) {
			break
		}
		nameLen := int(binary.BigEndian.Uint16(data[pos:]))
		pos += 2
		if pos+nameLen > len(data) {
			break
		}
		name := string(data[pos : pos+nameLen])
		pos += nameLen

		if pos+4 > len(data) {
			break
		}
		partCount := int(binary.BigEndian.Uint32(data[pos:]))
		pos += 4

		// Skip partition details: error_code(2) + partition_id(4) + leader(4) + replicas(array) + isr(array)
		for j := 0; j < partCount; j++ {
			if pos+10 > len(data) {
				break
			}
			pos += 10 // error_code + partition_id + leader
			if pos+4 > len(data) {
				break
			}
			replicaCnt := int(binary.BigEndian.Uint32(data[pos:]))
			pos += 4 + replicaCnt*4
			if pos+4 > len(data) {
				break
			}
			isrCnt := int(binary.BigEndian.Uint32(data[pos:]))
			pos += 4 + isrCnt*4
		}

		m.Topics = append(m.Topics, KafkaTopicInfo{Name: name, PartitionCount: partCount})
	}

	return m, nil
}

// --- RabbitMQ: Management HTTP API ---

func collectRabbitMQ(t mqCandidate, cfg models.CollectConfig, result *models.CollectResult) {
	mgmtPort := defaultMgmtPorts["rabbitmq"]
	if cfg.Extra != nil {
		if p, ok := cfg.Extra["mgmt_port"]; ok {
			mgmtPort = p
		}
	}

	if !isPortOpen(t.host, mgmtPort) {
		result.Errors = append(result.Errors, models.CollectError{
			Code:       models.ErrConnectionRefused,
			Message:    fmt.Sprintf("rabbitmq management API %s:%s not reachable", t.host, mgmtPort),
			Suggestion: "Enable rabbitmq_management plugin: rabbitmq-plugins enable rabbitmq_management",
		})
		return
	}

	user, pass := "guest", "guest"
	if cfg.Extra != nil {
		if u, ok := cfg.Extra["username"]; ok {
			user = u
		}
		if p, ok := cfg.Extra["password"]; ok {
			pass = p
		}
	}

	baseURL := fmt.Sprintf("http://%s:%s", t.host, mgmtPort)
	client := &http.Client{Timeout: 5 * time.Second}

	body, err := httpBasicGet(client, baseURL+"/api/overview", user, pass)
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("rabbitmq overview: %v", err),
		})
		return
	}

	var overview struct {
		RabbitMQVersion string `json:"rabbitmq_version"`
		ClusterName     string `json:"cluster_name"`
		QueueTotals     struct {
			Messages        int64 `json:"messages"`
			MessagesReady   int64 `json:"messages_ready"`
			MessagesUnacked int64 `json:"messages_unacknowledged"`
		} `json:"queue_totals"`
		ObjectTotals struct {
			Queues      int `json:"queues"`
			Connections int `json:"connections"`
			Channels    int `json:"channels"`
			Exchanges   int `json:"exchanges"`
			Consumers   int `json:"consumers"`
		} `json:"object_totals"`
		MessageStats struct {
			PublishDetails struct {
				Rate float64 `json:"rate"`
			} `json:"publish_details"`
			DeliverGetDetails struct {
				Rate float64 `json:"rate"`
			} `json:"deliver_get_details"`
		} `json:"message_stats"`
	}
	if err := json.Unmarshal(body, &overview); err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("parse rabbitmq overview: %v", err),
		})
		return
	}

	metrics := RabbitMQMetrics{
		Host:            t.host,
		Port:            t.port,
		Version:         overview.RabbitMQVersion,
		ClusterName:     overview.ClusterName,
		QueueCount:      overview.ObjectTotals.Queues,
		ConnectionCount: overview.ObjectTotals.Connections,
		ChannelCount:    overview.ObjectTotals.Channels,
		ExchangeCount:   overview.ObjectTotals.Exchanges,
		ConsumerCount:   overview.ObjectTotals.Consumers,
		MessageCount:    overview.QueueTotals.Messages,
		MessagesReady:   overview.QueueTotals.MessagesReady,
		MessagesUnacked: overview.QueueTotals.MessagesUnacked,
		PublishRate:      overview.MessageStats.PublishDetails.Rate,
		DeliverRate:      overview.MessageStats.DeliverGetDetails.Rate,
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "mq.broker.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})
}

// --- ActiveMQ: Jolokia REST API ---

func collectActiveMQ(t mqCandidate, cfg models.CollectConfig, result *models.CollectResult) {
	mgmtPort := defaultMgmtPorts["activemq"]
	if cfg.Extra != nil {
		if p, ok := cfg.Extra["mgmt_port"]; ok {
			mgmtPort = p
		}
	}

	if !isPortOpen(t.host, mgmtPort) {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("activemq web console %s:%s not reachable", t.host, mgmtPort),
		})
		return
	}

	user, pass := "admin", "admin"
	if cfg.Extra != nil {
		if u, ok := cfg.Extra["username"]; ok {
			user = u
		}
		if p, ok := cfg.Extra["password"]; ok {
			pass = p
		}
	}

	baseURL := fmt.Sprintf("http://%s:%s", t.host, mgmtPort)
	client := &http.Client{Timeout: 5 * time.Second}

	jolokiaURL := baseURL + "/api/jolokia/read/org.apache.activemq:type=Broker,brokerName=localhost"
	body, err := httpBasicGet(client, jolokiaURL, user, pass)
	if err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("activemq jolokia: %v", err),
		})
		return
	}

	var jolokia struct {
		Value struct {
			BrokerName            string        `json:"BrokerName"`
			UptimeMillis          int64         `json:"UptimeMillis"`
			TotalConnectionsCount int64         `json:"TotalConnectionsCount"`
			TotalConsumerCount    int64         `json:"TotalConsumerCount"`
			TotalProducerCount    int64         `json:"TotalProducerCount"`
			TotalEnqueueCount     int64         `json:"TotalEnqueueCount"`
			TotalDequeueCount     int64         `json:"TotalDequeueCount"`
			Queues                []interface{} `json:"Queues"`
			Topics                []interface{} `json:"Topics"`
			StorePercentUsage     float64       `json:"StorePercentUsage"`
			MemoryPercentUsage    float64       `json:"MemoryPercentUsage"`
		} `json:"value"`
	}
	if err := json.Unmarshal(body, &jolokia); err != nil {
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("parse activemq jolokia: %v", err),
		})
		return
	}

	metrics := ActiveMQMetrics{
		Host:             t.host,
		Port:             t.port,
		BrokerName:       jolokia.Value.BrokerName,
		UptimeMillis:     jolokia.Value.UptimeMillis,
		TotalConnections: jolokia.Value.TotalConnectionsCount,
		TotalConsumers:   jolokia.Value.TotalConsumerCount,
		TotalProducers:   jolokia.Value.TotalProducerCount,
		TotalQueues:      int64(len(jolokia.Value.Queues)),
		TotalTopics:      int64(len(jolokia.Value.Topics)),
		TotalEnqueued:    jolokia.Value.TotalEnqueueCount,
		TotalDequeued:    jolokia.Value.TotalDequeueCount,
		StoreUsagePct:    jolokia.Value.StorePercentUsage,
		MemoryUsagePct:   jolokia.Value.MemoryPercentUsage,
	}

	result.Items = append(result.Items, models.CollectedItem{
		SchemaName:    "mq.broker.v1",
		SchemaVersion: "1.0.0",
		MetricType:    "gauge",
		Category:      "it",
		Data:          metrics,
	})
}

// --- Helpers ---

// httpBasicGet performs an HTTP GET with Basic Auth and returns the response body.
func httpBasicGet(client *http.Client, url, user, pass string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(user, pass)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
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
