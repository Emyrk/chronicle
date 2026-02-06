package storage

import (
	"context"
	"io"
)

// FileOptions configures file upload behavior.
type FileOptions struct {
	ContentType *string
	CacheControl *string
}

// UrlOptions configures file download/URL behavior.
type UrlOptions struct {
	Transform *TransformOptions
}

// TransformOptions for image transformations (not used by S3, kept for interface compatibility).
type TransformOptions struct {
	Width   int
	Height  int
	Quality int
}

// BucketOptions configures bucket creation.
type BucketOptions struct {
	Public           bool
	AllowedMimeTypes []string
	FileSizeLimit    *int
}

// FileUploadResponse is returned after file operations.
type FileUploadResponse struct {
	Key     string
	Message string
}

// Bucket represents a storage bucket.
type Bucket struct {
	Id        string
	Name      string
	Public    bool
	CreatedAt string
	UpdatedAt string
}

// MessageResponse is a simple message response.
type MessageResponse struct {
	Message string
}

type ObjectStorage interface {
	UploadFile(ctx context.Context, bucketId string, relativePath string, data io.Reader, fileOptions ...FileOptions) (FileUploadResponse, error)
	DownloadFile(ctx context.Context, bucketId string, filePath string, urlOptions ...UrlOptions) ([]byte, error)
	RemoveFile(ctx context.Context, bucketId string, paths []string) ([]FileUploadResponse, error)
	CreateBucket(ctx context.Context, id string, options BucketOptions) (Bucket, error)
	DeleteBucket(ctx context.Context, id string) (MessageResponse, error)
	EmptyBucket(ctx context.Context, id string) (MessageResponse, error)
	MoveFile(ctx context.Context, bucketId string, sourceKey string, destinationKey string) (FileUploadResponse, error)
	ListBuckets(ctx context.Context) ([]Bucket, error)
}
