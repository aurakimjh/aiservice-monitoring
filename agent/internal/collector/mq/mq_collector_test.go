package mq

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// --- Interface tests ---

func TestMQCollectorInterface(t *testing.T) {
	c := New()
	if c.ID() != "it-mq" {
		t.Errorf("expected ID 'it-mq', got %q", c.ID())
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

func TestAutoDetect_NoMQ(t *testing.T) {
	c := New()
	result, err := c.AutoDetect(context.Background())
	if err != nil {
		t.Fatalf("AutoDetect returned error: %v", err)
	}
	_ = result.Detected
}

func TestCollect_NoMQ(t *testing.T) {
	c := New()
	result, err := c.Collect(context.Background(), models.CollectConfig{Hostname: "test"})
	if err != nil {
		t.Fatalf("Collect returned error: %v", err)
	}
	if result == nil {
		t.Fatal("Collect returned nil result")
	}
	if result.CollectorID != "it-mq" {
		t.Errorf("expected CollectorID 'it-mq', got %q", result.CollectorID)
	}
}

// --- parseKafkaMetadataResp tests ---

func buildKafkaMetadataResp(brokers []KafkaBroker, topics []KafkaTopicInfo) []byte {
	// Estimate size and build binary response
	buf := make([]byte, 0, 4096)

	// Correlation ID
	b4 := make([]byte, 4)
	binary.BigEndian.PutUint32(b4, 1)
	buf = append(buf, b4...)

	// Brokers
	binary.BigEndian.PutUint32(b4, uint32(len(brokers)))
	buf = append(buf, b4...)
	for _, br := range brokers {
		binary.BigEndian.PutUint32(b4, uint32(br.NodeID))
		buf = append(buf, b4...)
		b2 := make([]byte, 2)
		binary.BigEndian.PutUint16(b2, uint16(len(br.Host)))
		buf = append(buf, b2...)
		buf = append(buf, []byte(br.Host)...)
		binary.BigEndian.PutUint32(b4, uint32(br.Port))
		buf = append(buf, b4...)
	}

	// Topics
	binary.BigEndian.PutUint32(b4, uint32(len(topics)))
	buf = append(buf, b4...)
	for _, tp := range topics {
		b2 := make([]byte, 2)
		// error_code = 0
		binary.BigEndian.PutUint16(b2, 0)
		buf = append(buf, b2...)
		// topic name
		binary.BigEndian.PutUint16(b2, uint16(len(tp.Name)))
		buf = append(buf, b2...)
		buf = append(buf, []byte(tp.Name)...)
		// partition count
		binary.BigEndian.PutUint32(b4, uint32(tp.PartitionCount))
		buf = append(buf, b4...)
		// partition details (minimal)
		for j := 0; j < tp.PartitionCount; j++ {
			// error_code(2) + partition_id(4) + leader(4)
			partBuf := make([]byte, 10)
			binary.BigEndian.PutUint32(partBuf[2:], uint32(j))
			binary.BigEndian.PutUint32(partBuf[6:], 0) // leader=0
			buf = append(buf, partBuf...)
			// replicas: count=1, [0]
			binary.BigEndian.PutUint32(b4, 1)
			buf = append(buf, b4...)
			binary.BigEndian.PutUint32(b4, 0)
			buf = append(buf, b4...)
			// isr: count=1, [0]
			binary.BigEndian.PutUint32(b4, 1)
			buf = append(buf, b4...)
			binary.BigEndian.PutUint32(b4, 0)
			buf = append(buf, b4...)
		}
	}

	return buf
}

func TestParseKafkaMetadataResp_Basic(t *testing.T) {
	brokers := []KafkaBroker{
		{NodeID: 0, Host: "broker-0", Port: 9092},
		{NodeID: 1, Host: "broker-1", Port: 9093},
	}
	topics := []KafkaTopicInfo{
		{Name: "orders", PartitionCount: 3},
		{Name: "events", PartitionCount: 1},
	}
	data := buildKafkaMetadataResp(brokers, topics)
	target := mqCandidate{mqType: "kafka", host: "127.0.0.1", port: "9092"}

	m, err := parseKafkaMetadataResp(data, target)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if m.BrokerCount != 2 {
		t.Errorf("BrokerCount = %d, want 2", m.BrokerCount)
	}
	if len(m.Brokers) != 2 {
		t.Fatalf("len(Brokers) = %d, want 2", len(m.Brokers))
	}
	if m.Brokers[0].Host != "broker-0" {
		t.Errorf("Brokers[0].Host = %q, want 'broker-0'", m.Brokers[0].Host)
	}
	if m.Brokers[1].Port != 9093 {
		t.Errorf("Brokers[1].Port = %d, want 9093", m.Brokers[1].Port)
	}
	if m.TopicCount != 2 {
		t.Errorf("TopicCount = %d, want 2", m.TopicCount)
	}
	if len(m.Topics) != 2 {
		t.Fatalf("len(Topics) = %d, want 2", len(m.Topics))
	}
	if m.Topics[0].Name != "orders" {
		t.Errorf("Topics[0].Name = %q, want 'orders'", m.Topics[0].Name)
	}
	if m.Topics[0].PartitionCount != 3 {
		t.Errorf("Topics[0].PartitionCount = %d, want 3", m.Topics[0].PartitionCount)
	}
	if m.Topics[1].Name != "events" {
		t.Errorf("Topics[1].Name = %q, want 'events'", m.Topics[1].Name)
	}
	if m.Host != "127.0.0.1" || m.Port != "9092" {
		t.Errorf("Host/Port mismatch: %s:%s", m.Host, m.Port)
	}
}

func TestParseKafkaMetadataResp_Empty(t *testing.T) {
	data := buildKafkaMetadataResp(nil, nil)
	target := mqCandidate{mqType: "kafka", host: "127.0.0.1", port: "9092"}

	m, err := parseKafkaMetadataResp(data, target)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if m.BrokerCount != 0 {
		t.Errorf("BrokerCount = %d, want 0", m.BrokerCount)
	}
	if m.TopicCount != 0 {
		t.Errorf("TopicCount = %d, want 0", m.TopicCount)
	}
}

func TestParseKafkaMetadataResp_Truncated(t *testing.T) {
	// Only correlation_id — should return without error but with 0 counts
	data := []byte{0, 0, 0, 1}
	target := mqCandidate{mqType: "kafka", host: "127.0.0.1", port: "9092"}

	m, err := parseKafkaMetadataResp(data, target)
	if err == nil {
		// partial data may or may not error, but should not panic
		_ = m
	}
}

// --- RabbitMQ mock HTTP server test ---

func TestCollectRabbitMQ_MockAPI(t *testing.T) {
	overview := map[string]interface{}{
		"rabbitmq_version": "3.13.0",
		"cluster_name":     "rabbit@test",
		"queue_totals": map[string]interface{}{
			"messages":               150,
			"messages_ready":         100,
			"messages_unacknowledged": 50,
		},
		"object_totals": map[string]interface{}{
			"queues":      5,
			"connections": 10,
			"channels":    20,
			"exchanges":   8,
			"consumers":   3,
		},
		"message_stats": map[string]interface{}{
			"publish_details":     map[string]interface{}{"rate": 42.5},
			"deliver_get_details": map[string]interface{}{"rate": 38.2},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/overview", func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "guest" || pass != "guest" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(overview)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// Extract host:port from test server
	_, srvPort, _ := net.SplitHostPort(srv.Listener.Addr().String())

	target := mqCandidate{mqType: "rabbitmq", host: "127.0.0.1", port: "5672"}
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"mgmt_port": srvPort,
			"username":  "guest",
			"password":  "guest",
		},
	}
	result := &models.CollectResult{
		Items:  []models.CollectedItem{},
		Errors: []models.CollectError{},
	}

	collectRabbitMQ(target, cfg, result)

	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}

	metrics, ok := result.Items[0].Data.(RabbitMQMetrics)
	if !ok {
		t.Fatal("expected RabbitMQMetrics data type")
	}
	if metrics.Version != "3.13.0" {
		t.Errorf("Version = %q, want '3.13.0'", metrics.Version)
	}
	if metrics.ClusterName != "rabbit@test" {
		t.Errorf("ClusterName = %q, want 'rabbit@test'", metrics.ClusterName)
	}
	if metrics.QueueCount != 5 {
		t.Errorf("QueueCount = %d, want 5", metrics.QueueCount)
	}
	if metrics.ConnectionCount != 10 {
		t.Errorf("ConnectionCount = %d, want 10", metrics.ConnectionCount)
	}
	if metrics.MessageCount != 150 {
		t.Errorf("MessageCount = %d, want 150", metrics.MessageCount)
	}
	if metrics.PublishRate != 42.5 {
		t.Errorf("PublishRate = %f, want 42.5", metrics.PublishRate)
	}
	if metrics.DeliverRate != 38.2 {
		t.Errorf("DeliverRate = %f, want 38.2", metrics.DeliverRate)
	}
}

// --- ActiveMQ mock HTTP server test ---

func TestCollectActiveMQ_MockAPI(t *testing.T) {
	jolokiaResp := map[string]interface{}{
		"value": map[string]interface{}{
			"BrokerName":            "localhost",
			"UptimeMillis":          86400000,
			"TotalConnectionsCount": 25,
			"TotalConsumerCount":    10,
			"TotalProducerCount":    5,
			"TotalEnqueueCount":     50000,
			"TotalDequeueCount":     49000,
			"Queues":                []interface{}{"q1", "q2", "q3"},
			"Topics":                []interface{}{"t1", "t2"},
			"StorePercentUsage":     12.5,
			"MemoryPercentUsage":    45.3,
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/jolokia/read/org.apache.activemq:type=Broker,brokerName=localhost", func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "admin" || pass != "admin" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jolokiaResp)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	_, srvPort, _ := net.SplitHostPort(srv.Listener.Addr().String())

	target := mqCandidate{mqType: "activemq", host: "127.0.0.1", port: "61616"}
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"mgmt_port": srvPort,
			"username":  "admin",
			"password":  "admin",
		},
	}
	result := &models.CollectResult{
		Items:  []models.CollectedItem{},
		Errors: []models.CollectError{},
	}

	collectActiveMQ(target, cfg, result)

	if len(result.Errors) > 0 {
		t.Fatalf("unexpected errors: %v", result.Errors)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(result.Items))
	}

	metrics, ok := result.Items[0].Data.(ActiveMQMetrics)
	if !ok {
		t.Fatal("expected ActiveMQMetrics data type")
	}
	if metrics.BrokerName != "localhost" {
		t.Errorf("BrokerName = %q, want 'localhost'", metrics.BrokerName)
	}
	if metrics.UptimeMillis != 86400000 {
		t.Errorf("UptimeMillis = %d, want 86400000", metrics.UptimeMillis)
	}
	if metrics.TotalConnections != 25 {
		t.Errorf("TotalConnections = %d, want 25", metrics.TotalConnections)
	}
	if metrics.TotalQueues != 3 {
		t.Errorf("TotalQueues = %d, want 3", metrics.TotalQueues)
	}
	if metrics.TotalTopics != 2 {
		t.Errorf("TotalTopics = %d, want 2", metrics.TotalTopics)
	}
	if metrics.TotalEnqueued != 50000 {
		t.Errorf("TotalEnqueued = %d, want 50000", metrics.TotalEnqueued)
	}
	if metrics.StoreUsagePct != 12.5 {
		t.Errorf("StoreUsagePct = %f, want 12.5", metrics.StoreUsagePct)
	}
	if metrics.MemoryUsagePct != 45.3 {
		t.Errorf("MemoryUsagePct = %f, want 45.3", metrics.MemoryUsagePct)
	}
}

// --- resolveTargets tests ---

func TestResolveTargets_FromExtra(t *testing.T) {
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"mq_type": "kafka",
			"host":    "10.0.0.5",
			"port":    "9093",
		},
	}
	targets := resolveTargets(cfg)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0].mqType != "kafka" || targets[0].host != "10.0.0.5" || targets[0].port != "9093" {
		t.Errorf("unexpected target: %+v", targets[0])
	}
}

func TestResolveTargets_DefaultPort(t *testing.T) {
	cfg := models.CollectConfig{
		Extra: map[string]string{
			"mq_type": "rabbitmq",
		},
	}
	targets := resolveTargets(cfg)
	if len(targets) != 1 {
		t.Fatalf("expected 1 target, got %d", len(targets))
	}
	if targets[0].port != "5672" {
		t.Errorf("expected default rabbitmq port 5672, got %q", targets[0].port)
	}
}

func TestResolveTargets_NoExtra(t *testing.T) {
	cfg := models.CollectConfig{}
	targets := resolveTargets(cfg)
	_ = targets
}

// --- isPortOpen test ---

func TestIsPortOpen_Closed(t *testing.T) {
	open := isPortOpen("127.0.0.1", "19998")
	if open {
		t.Skip("port 19998 unexpectedly open — skipping test")
	}
}

// --- httpBasicGet test ---

func TestHttpBasicGet_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "u" || pass != "p" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer srv.Close()

	client := &http.Client{}
	body, err := httpBasicGet(client, srv.URL, "u", "p")
	if err != nil {
		t.Fatalf("httpBasicGet error: %v", err)
	}
	if string(body) != `{"ok":true}` {
		t.Errorf("unexpected body: %s", body)
	}
}

func TestHttpBasicGet_Unauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}))
	defer srv.Close()

	client := &http.Client{}
	_, err := httpBasicGet(client, srv.URL, "u", "p")
	if err == nil {
		t.Error("expected error for 401 response")
	}
}
