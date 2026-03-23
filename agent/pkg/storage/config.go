package storage

// StorageConfig holds the complete storage backend configuration.
type StorageConfig struct {
	Type  string      `yaml:"type"`  // "s3", "local", or "both"
	S3    S3Config    `yaml:"s3"`
	Local LocalConfig `yaml:"local"`
}

// S3Config holds S3/MinIO connection parameters.
type S3Config struct {
	Endpoint  string `yaml:"endpoint"`   // e.g., "s3.amazonaws.com" or "minio:9000"
	Bucket    string `yaml:"bucket"`     // e.g., "aitop-evidence"
	AccessKey string `yaml:"access-key"`
	SecretKey string `yaml:"secret-key"`
	Region    string `yaml:"region"`    // e.g., "ap-northeast-2"
	UseSSL    bool   `yaml:"use-ssl"`
	PathStyle bool   `yaml:"path-style"` // true for MinIO
}

// LocalConfig holds local filesystem storage parameters.
type LocalConfig struct {
	BasePath      string `yaml:"base-path"`      // e.g., "/var/aitop/data"
	RetentionDays int    `yaml:"retention-days"` // auto-purge after N days (0 = no purge)
}
