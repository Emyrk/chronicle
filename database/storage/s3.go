package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var _ ObjectStorage = (*S3Storage)(nil)

// S3Storage implements ObjectStorage using AWS S3.
type S3Storage struct {
	client *s3.Client
	// region is stored for bucket creation.
	region string
	// bucket is the single bucket name when using S3-compatible services that provide one bucket.
	// When set, the bucketId parameter in methods becomes a key prefix instead.
	bucket string
}

// S3Options configures the S3 client.
type S3Options struct {
	// Region is the AWS region (e.g., "us-east-1").
	Region string
	// Endpoint is an optional custom endpoint URL (for S3-compatible services like MinIO).
	Endpoint string
	// AccessKeyID is the AWS access key ID.
	AccessKeyID string
	// SecretAccessKey is the AWS secret access key.
	SecretAccessKey string
	// UsePathStyle enables path-style addressing (required for MinIO and some S3-compatible services).
	UsePathStyle bool
	// Bucket is the single bucket name to use. When set, bucketId parameters become key prefixes.
	// This is useful for S3-compatible services like Railway/Tigris that provide a single bucket.
	Bucket string
}

// NewS3Storage creates a new S3 storage client.
func NewS3Storage(ctx context.Context, opts S3Options) (*S3Storage, error) {
	var cfgOpts []func(*config.LoadOptions) error

	if opts.Region != "" {
		cfgOpts = append(cfgOpts, config.WithRegion(opts.Region))
	}

	if opts.AccessKeyID != "" && opts.SecretAccessKey != "" {
		cfgOpts = append(cfgOpts, config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(opts.AccessKeyID, opts.SecretAccessKey, ""),
		))
	}

	cfg, err := config.LoadDefaultConfig(ctx, cfgOpts...)
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}

	var s3Opts []func(*s3.Options)
	if opts.Endpoint != "" {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(opts.Endpoint)
		})
	}
	if opts.UsePathStyle {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.UsePathStyle = true
		})
	}

	client := s3.NewFromConfig(cfg, s3Opts...)

	return &S3Storage{
		client: client,
		region: opts.Region,
		bucket: opts.Bucket,
	}, nil
}

// bucketAndKey returns the actual bucket and key to use.
// If s.bucket is set, it uses that bucket and prefixes the key with bucketId.
// Otherwise, it uses bucketId as the bucket name directly.
func (s *S3Storage) bucketAndKey(bucketId, key string) (bucket, fullKey string) {
	if s.bucket != "" {
		return s.bucket, path.Join(bucketId, key)
	}
	return bucketId, key
}

func (s *S3Storage) UploadFile(ctx context.Context, bucketId string, relativePath string, data io.Reader, fileOptions ...FileOptions) (FileUploadResponse, error) {
	bucket, key := s.bucketAndKey(bucketId, relativePath)
	input := &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   data,
	}

	if len(fileOptions) > 0 {
		opts := fileOptions[0]
		if opts.ContentType != nil {
			input.ContentType = opts.ContentType
		}
		if opts.CacheControl != nil {
			input.CacheControl = opts.CacheControl
		}
	}

	_, err := s.client.PutObject(ctx, input)
	if err != nil {
		return FileUploadResponse{}, fmt.Errorf("put object: %w", err)
	}

	return FileUploadResponse{Key: path.Join(bucketId, relativePath)}, nil
}

func (s *S3Storage) DownloadFile(ctx context.Context, bucketId string, filePath string, _ ...UrlOptions) ([]byte, error) {
	bucket, key := s.bucketAndKey(bucketId, filePath)
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	//nolint:errcheck
	defer output.Body.Close()

	data, err := io.ReadAll(output.Body)
	if err != nil {
		return nil, fmt.Errorf("read object body: %w", err)
	}

	return data, nil
}

func (s *S3Storage) RemoveFile(ctx context.Context, bucketId string, paths []string) ([]FileUploadResponse, error) {
	if len(paths) == 0 {
		return nil, nil
	}

	bucket, _ := s.bucketAndKey(bucketId, "")

	// Use DeleteObjects for batch deletion.
	objects := make([]types.ObjectIdentifier, len(paths))
	for i, p := range paths {
		_, key := s.bucketAndKey(bucketId, p)
		objects[i] = types.ObjectIdentifier{
			Key: aws.String(key),
		}
	}

	_, err := s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(bucket),
		Delete: &types.Delete{
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("delete objects: %w", err)
	}

	responses := make([]FileUploadResponse, len(paths))
	for i, p := range paths {
		responses[i] = FileUploadResponse{Key: path.Join(bucketId, p)}
	}
	return responses, nil
}

func (s *S3Storage) CreateBucket(ctx context.Context, id string, options BucketOptions) (Bucket, error) {
	// When using a single bucket (s.bucket is set), we don't actually create buckets.
	// The "bucket" becomes a key prefix instead.
	if s.bucket != "" {
		return Bucket{Id: id, Name: id, Public: options.Public}, nil
	}

	input := &s3.CreateBucketInput{
		Bucket: aws.String(id),
	}

	// Only set LocationConstraint for non-us-east-1 regions.
	// us-east-1 requires no constraint (or will error).
	if s.region != "" && s.region != "us-east-1" {
		input.CreateBucketConfiguration = &types.CreateBucketConfiguration{
			LocationConstraint: types.BucketLocationConstraint(s.region),
		}
	}

	_, err := s.client.CreateBucket(ctx, input)
	if err != nil {
		return Bucket{}, fmt.Errorf("create bucket: %w", err)
	}

	// S3 doesn't have built-in public bucket settings like Supabase.
	// Public access would be configured via bucket policies separately.
	_ = options

	return Bucket{Id: id, Name: id, Public: options.Public}, nil
}

func (s *S3Storage) DeleteBucket(ctx context.Context, id string) (MessageResponse, error) {
	// When using a single bucket, we don't delete the bucket itself.
	// We could delete all objects with the prefix, but that's what EmptyBucket does.
	if s.bucket != "" {
		return MessageResponse{Message: "Bucket deleted (prefix mode - no actual bucket deleted)"}, nil
	}

	_, err := s.client.DeleteBucket(ctx, &s3.DeleteBucketInput{
		Bucket: aws.String(id),
	})
	if err != nil {
		return MessageResponse{}, fmt.Errorf("delete bucket: %w", err)
	}

	return MessageResponse{Message: "Bucket deleted"}, nil
}

func (s *S3Storage) EmptyBucket(ctx context.Context, id string) (MessageResponse, error) {
	bucket := id
	prefix := ""
	if s.bucket != "" {
		bucket = s.bucket
		prefix = id + "/"
	}

	// List and delete all objects in the bucket (or with prefix).
	input := &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
	}
	if prefix != "" {
		input.Prefix = aws.String(prefix)
	}

	paginator := s3.NewListObjectsV2Paginator(s.client, input)

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return MessageResponse{}, fmt.Errorf("list objects: %w", err)
		}

		if len(page.Contents) == 0 {
			continue
		}

		objects := make([]types.ObjectIdentifier, len(page.Contents))
		for i, obj := range page.Contents {
			objects[i] = types.ObjectIdentifier{
				Key: obj.Key,
			}
		}

		_, err = s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(bucket),
			Delete: &types.Delete{
				Objects: objects,
				Quiet:   aws.Bool(true),
			},
		})
		if err != nil {
			return MessageResponse{}, fmt.Errorf("delete objects: %w", err)
		}
	}

	return MessageResponse{Message: "Bucket emptied"}, nil
}

func (s *S3Storage) MoveFile(ctx context.Context, bucketId string, sourceKey string, destinationKey string) (FileUploadResponse, error) {
	bucket, srcKey := s.bucketAndKey(bucketId, sourceKey)
	_, destKey := s.bucketAndKey(bucketId, destinationKey)

	// S3 doesn't have a native move operation, so we copy then delete.
	_, err := s.client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(bucket),
		CopySource: aws.String(path.Join(bucket, srcKey)),
		Key:        aws.String(destKey),
	})
	if err != nil {
		return FileUploadResponse{}, fmt.Errorf("copy object: %w", err)
	}

	_, err = s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(srcKey),
	})
	if err != nil {
		return FileUploadResponse{}, fmt.Errorf("delete source object: %w", err)
	}

	return FileUploadResponse{Key: path.Join(bucketId, destinationKey)}, nil
}

func (s *S3Storage) ListBuckets(ctx context.Context) ([]Bucket, error) {
	// When using single bucket mode, we can't really list "buckets" in the traditional sense.
	// We could list prefixes, but that's not straightforward. Just return the configured bucket.
	if s.bucket != "" {
		return []Bucket{{Id: s.bucket, Name: s.bucket}}, nil
	}

	output, err := s.client.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, fmt.Errorf("list buckets: %w", err)
	}

	buckets := make([]Bucket, len(output.Buckets))
	for i, b := range output.Buckets {
		var createdAt string
		if b.CreationDate != nil {
			createdAt = b.CreationDate.Format("2006-01-02T15:04:05Z")
		}
		buckets[i] = Bucket{
			Id:        aws.ToString(b.Name),
			Name:      aws.ToString(b.Name),
			CreatedAt: createdAt,
		}
	}

	return buckets, nil
}

// UploadFileFromBytes is a convenience method to upload from a byte slice.
func (s *S3Storage) UploadFileFromBytes(ctx context.Context, bucketId string, relativePath string, data []byte, fileOptions ...FileOptions) (FileUploadResponse, error) {
	return s.UploadFile(ctx, bucketId, relativePath, bytes.NewReader(data), fileOptions...)
}
