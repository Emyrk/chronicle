package storage

import (
	"context"
	"fmt"
	"io"

	storage_go "github.com/supabase-community/storage-go"
)

var _ ObjectStorage = (*SupabaseStorage)(nil)

// SupabaseStorage wraps the supabase-community/storage-go client to implement ObjectStorage.
type SupabaseStorage struct {
	client *storage_go.Client
}

// NewSupabaseStorage creates a new Supabase storage client.
func NewSupabaseStorage(projectID, projectAPIKey string) (*SupabaseStorage, error) {
	client := storage_go.NewClient(
		fmt.Sprintf("https://%s.supabase.co/storage/v1", projectID),
		projectAPIKey,
		nil,
	)

	// Test connection
	_, err := client.ListBuckets()
	if err != nil {
		return nil, fmt.Errorf("test connection to storage service: %w", err)
	}

	return &SupabaseStorage{client: client}, nil
}

func (s *SupabaseStorage) UploadFile(_ context.Context, bucketId string, relativePath string, data io.Reader, fileOptions ...FileOptions) (FileUploadResponse, error) {
	var opts []storage_go.FileOptions
	for _, fo := range fileOptions {
		opts = append(opts, storage_go.FileOptions{
			ContentType:  fo.ContentType,
			CacheControl: fo.CacheControl,
		})
	}

	resp, err := s.client.UploadFile(bucketId, relativePath, data, opts...)
	if err != nil {
		return FileUploadResponse{}, err
	}

	return FileUploadResponse{
		Key:     resp.Key,
		Message: resp.Message,
	}, nil
}

func (s *SupabaseStorage) DownloadFile(_ context.Context, bucketId string, filePath string, urlOptions ...UrlOptions) ([]byte, error) {
	var opts []storage_go.UrlOptions
	for _, uo := range urlOptions {
		opt := storage_go.UrlOptions{}
		if uo.Transform != nil {
			opt.Transform = &storage_go.TransformOptions{
				Width:   uo.Transform.Width,
				Height:  uo.Transform.Height,
				Quality: uo.Transform.Quality,
			}
		}
		opts = append(opts, opt)
	}

	return s.client.DownloadFile(bucketId, filePath, opts...)
}

func (s *SupabaseStorage) RemoveFile(_ context.Context, bucketId string, paths []string) ([]FileUploadResponse, error) {
	resps, err := s.client.RemoveFile(bucketId, paths)
	if err != nil {
		return nil, err
	}

	var result []FileUploadResponse
	for _, r := range resps {
		result = append(result, FileUploadResponse{
			Key:     r.Key,
			Message: r.Message,
		})
	}
	return result, nil
}

func (s *SupabaseStorage) CreateBucket(_ context.Context, id string, options BucketOptions) (Bucket, error) {
	var fileSizeLimit string
	if options.FileSizeLimit != nil {
		fileSizeLimit = fmt.Sprintf("%d", *options.FileSizeLimit)
	}

	bucket, err := s.client.CreateBucket(id, storage_go.BucketOptions{
		Public:           options.Public,
		AllowedMimeTypes: options.AllowedMimeTypes,
		FileSizeLimit:    fileSizeLimit,
	})
	if err != nil {
		return Bucket{}, err
	}

	return Bucket{
		Id:        bucket.Id,
		Name:      bucket.Name,
		Public:    bucket.Public,
		CreatedAt: bucket.CreatedAt,
		UpdatedAt: bucket.UpdatedAt,
	}, nil
}

func (s *SupabaseStorage) DeleteBucket(_ context.Context, id string) (MessageResponse, error) {
	resp, err := s.client.DeleteBucket(id)
	if err != nil {
		return MessageResponse{}, err
	}
	return MessageResponse{Message: resp.Message}, nil
}

func (s *SupabaseStorage) EmptyBucket(_ context.Context, id string) (MessageResponse, error) {
	resp, err := s.client.EmptyBucket(id)
	if err != nil {
		return MessageResponse{}, err
	}
	return MessageResponse{Message: resp.Message}, nil
}

func (s *SupabaseStorage) MoveFile(_ context.Context, bucketId string, sourceKey string, destinationKey string) (FileUploadResponse, error) {
	resp, err := s.client.MoveFile(bucketId, sourceKey, destinationKey)
	if err != nil {
		return FileUploadResponse{}, err
	}
	return FileUploadResponse{
		Key:     resp.Key,
		Message: resp.Message,
	}, nil
}

func (s *SupabaseStorage) ListBuckets(_ context.Context) ([]Bucket, error) {
	buckets, err := s.client.ListBuckets()
	if err != nil {
		return nil, err
	}

	var result []Bucket
	for _, b := range buckets {
		result = append(result, Bucket{
			Id:        b.Id,
			Name:      b.Name,
			Public:    b.Public,
			CreatedAt: b.CreatedAt,
			UpdatedAt: b.UpdatedAt,
		})
	}
	return result, nil
}
