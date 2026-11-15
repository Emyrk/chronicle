package chronicle

import (
	"context"
	"errors"
	"slices"

	"github.com/Emyrk/chronicle/database/storage"
)

type failAcceptedCheckpointDeletion struct {
	storage.ObjectStorage
	key string
}

func (s failAcceptedCheckpointDeletion) RemoveFile(ctx context.Context, bucket string, keys []string) ([]storage.FileUploadResponse, error) {
	if slices.Contains(keys, s.key) {
		return nil, errors.New("checkpoint delete unavailable")
	}
	return s.ObjectStorage.RemoveFile(ctx, bucket, keys)
}
