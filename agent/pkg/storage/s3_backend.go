package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Backend stores evidence files in S3-compatible object storage.
type S3Backend struct {
	client *minio.Client
	bucket string
}

// NewS3Backend creates an S3 storage backend using the minio-go SDK.
func NewS3Backend(cfg S3Config) (*S3Backend, error) {
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("s3 bucket is required")
	}

	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = "s3.amazonaws.com"
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("create s3 client: %w", err)
	}

	return &S3Backend{client: client, bucket: cfg.Bucket}, nil
}

func (b *S3Backend) Type() string { return "s3" }

func (b *S3Backend) Put(ctx context.Context, key string, data []byte, metadata map[string]string) (string, error) {
	opts := minio.PutObjectOptions{
		ContentType:  "application/octet-stream",
		UserMetadata: metadata,
	}

	_, err := b.client.PutObject(ctx, b.bucket, key, bytes.NewReader(data), int64(len(data)), opts)
	if err != nil {
		return "", fmt.Errorf("s3 put %s: %w", key, err)
	}

	return fmt.Sprintf("s3://%s/%s", b.bucket, key), nil
}

func (b *S3Backend) PutStream(ctx context.Context, key string, r io.Reader, size int64, metadata map[string]string) (string, error) {
	opts := minio.PutObjectOptions{
		ContentType:  "application/octet-stream",
		UserMetadata: metadata,
	}

	_, err := b.client.PutObject(ctx, b.bucket, key, r, size, opts)
	if err != nil {
		return "", fmt.Errorf("s3 put-stream %s: %w", key, err)
	}

	return fmt.Sprintf("s3://%s/%s", b.bucket, key), nil
}

func (b *S3Backend) Get(ctx context.Context, key string) ([]byte, error) {
	obj, err := b.client.GetObject(ctx, b.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("s3 get %s: %w", key, err)
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, fmt.Errorf("s3 read %s: %w", key, err)
	}
	return data, nil
}

func (b *S3Backend) List(ctx context.Context, prefix string) ([]StorageEntry, error) {
	var entries []StorageEntry

	opts := minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}

	for obj := range b.client.ListObjects(ctx, b.bucket, opts) {
		if obj.Err != nil {
			return entries, fmt.Errorf("s3 list: %w", obj.Err)
		}
		entries = append(entries, StorageEntry{
			Key:          obj.Key,
			Size:         obj.Size,
			LastModified: obj.LastModified,
			Metadata:     obj.UserMetadata,
		})
	}

	return entries, nil
}

func (b *S3Backend) Delete(ctx context.Context, key string) error {
	if err := b.client.RemoveObject(ctx, b.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("s3 delete %s: %w", key, err)
	}
	return nil
}

func (b *S3Backend) Purge(ctx context.Context, prefix string, olderThan time.Time) (int, error) {
	opts := minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}

	deleted := 0
	for obj := range b.client.ListObjects(ctx, b.bucket, opts) {
		if obj.Err != nil {
			return deleted, fmt.Errorf("s3 purge list: %w", obj.Err)
		}
		if obj.LastModified.Before(olderThan) {
			if err := b.client.RemoveObject(ctx, b.bucket, obj.Key, minio.RemoveObjectOptions{}); err == nil {
				deleted++
			}
		}
	}

	return deleted, nil
}

func (b *S3Backend) Health(ctx context.Context) error {
	exists, err := b.client.BucketExists(ctx, b.bucket)
	if err != nil {
		return fmt.Errorf("s3 health check: %w", err)
	}
	if !exists {
		return fmt.Errorf("s3 bucket %q does not exist", b.bucket)
	}
	return nil
}
