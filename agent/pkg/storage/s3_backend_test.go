//go:build integration

package storage

import (
	"context"
	"os"
	"testing"
)

// These tests require a running MinIO instance.
// Run with: go test -tags=integration ./pkg/storage/ -run TestS3

func getTestS3Config() S3Config {
	return S3Config{
		Endpoint:  envOrDefault("TEST_S3_ENDPOINT", "localhost:9000"),
		Bucket:    envOrDefault("TEST_S3_BUCKET", "aitop-evidence"),
		AccessKey: envOrDefault("TEST_S3_ACCESS_KEY", "minioadmin"),
		SecretKey: envOrDefault("TEST_S3_SECRET_KEY", "minioadmin"),
		UseSSL:    false,
		PathStyle: true,
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func TestS3Backend_PutAndGet(t *testing.T) {
	b, err := NewS3Backend(getTestS3Config())
	if err != nil {
		t.Fatalf("NewS3Backend: %v", err)
	}
	ctx := context.Background()

	ref, err := b.Put(ctx, "test/integration.json", []byte(`{"test":true}`), map[string]string{"env": "test"})
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	t.Logf("ref: %s", ref)

	data, err := b.Get(ctx, "test/integration.json")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(data) != `{"test":true}` {
		t.Errorf("unexpected data: %s", data)
	}

	// Cleanup
	b.Delete(ctx, "test/integration.json")
}

func TestS3Backend_Health(t *testing.T) {
	b, err := NewS3Backend(getTestS3Config())
	if err != nil {
		t.Fatal(err)
	}
	if err := b.Health(context.Background()); err != nil {
		t.Errorf("Health: %v", err)
	}
}

func TestS3Backend_Type(t *testing.T) {
	b, err := NewS3Backend(getTestS3Config())
	if err != nil {
		t.Fatal(err)
	}
	if b.Type() != "s3" {
		t.Errorf("expected 's3', got %q", b.Type())
	}
}
