package chronicle

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"path"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// EventStreamStore persists compressed event streams either inline in PostgreSQL
// or as external objects with metadata in PostgreSQL.
type EventStreamStore struct {
	backend database.LogEventStorage
	objects storage.ObjectStorage
	logger  *slog.Logger
}

func NewEventStreamStore(backend database.LogEventStorage, objects storage.ObjectStorage, logger *slog.Logger) (*EventStreamStore, error) {
	if backend == "" {
		backend = database.LogEventStorageDatabase
	}
	if backend == database.LogEventStorageR2 && objects == nil {
		return nil, fmt.Errorf("R2 event storage requires object storage")
	}
	return &EventStreamStore{backend: backend, objects: objects, logger: logger}, nil
}

func (s *EventStreamStore) Backend() database.LogEventStorage {
	return s.backend
}

func EventStreamObjectKey(logGroupID, instanceID uuid.UUID, eventType database.LogInstanceEventType) string {
	return path.Join("events", logGroupID.String(), instanceID.String(), string(eventType))
}

// Prepare compresses and, for R2, uploads event objects before the caller opens
// its database transaction. The returned cleanup compensates for a later
// transaction failure and is safe to call after a partial upload.
func (s *EventStreamStore) Prepare(ctx context.Context, logGroupID, instanceID uuid.UUID, events *encounterevents.Events) ([]database.InsertLogInstanceEventsParams, func(), error) {
	streams, err := events.Compressed()
	if err != nil {
		return nil, func() {}, err
	}

	params := make([]database.InsertLogInstanceEventsParams, 0, len(streams))
	uploaded := make([]string, 0, len(streams))
	cleanup := func() {
		if len(uploaded) == 0 || s.objects == nil {
			return
		}
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if _, cleanupErr := s.objects.RemoveFile(cleanupCtx, "", uploaded); cleanupErr != nil && s.logger != nil {
			s.logger.WarnContext(ctx, "failed to compensate event stream uploads", slog.Any("error", cleanupErr))
		}
	}

	for _, stream := range streams {
		param := database.InsertLogInstanceEventsParams{
			InstanceID: instanceID,
			Type:       stream.Type,
			Storage:    s.backend,
			SizeBytes:  int64(len(stream.Data)),
		}
		if s.backend == database.LogEventStorageDatabase {
			param.Events = stream.Data
		} else {
			key := EventStreamObjectKey(logGroupID, instanceID, stream.Type)
			contentType := "application/octet-stream"
			cacheControl := "public, max-age=31536000, immutable"
			if _, err := s.objects.UploadFile(ctx, "", key, bytes.NewReader(stream.Data), storage.FileOptions{
				ContentType:  &contentType,
				CacheControl: &cacheControl,
			}); err != nil {
				cleanup()
				return nil, func() {}, fmt.Errorf("upload event stream %s: %w", stream.Type, err)
			}
			uploaded = append(uploaded, key)
			param.ObjectKey = pgtype.Text{String: key, Valid: true}
		}
		params = append(params, param)
	}
	return params, cleanup, nil
}
