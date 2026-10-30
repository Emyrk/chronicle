package chronicle

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/messagesource"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/sidekickstorage"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
)

// sidekickArtifactSource consumes positional artifacts sequentially. It loads
// only the next artifact when the current artifact reaches EOF, so a multipart
// logical log does not keep every artifact payload in memory at once.
type sidekickArtifactSource struct {
	storage   storage.ObjectStorage
	logger    *slog.Logger
	artifacts []database.LogGroupArtifact
	next      int
	current   messagesource.MessageSource

	sawUnitPosition  bool
	sawUnitResources bool
}

func newSidekickArtifactSource(objectStorage storage.ObjectStorage, logger *slog.Logger, artifacts []database.LogGroupArtifact) *sidekickArtifactSource {
	return &sidekickArtifactSource{storage: objectStorage, logger: logger, artifacts: artifacts}
}

func (s *sidekickArtifactSource) Advance(ctx context.Context) ([]messages.Message, error) {
	for {
		if s.current != nil {
			batch, err := s.current.Advance(ctx)
			if err == nil {
				return batch, nil
			}
			if !errors.Is(err, io.EOF) {
				return nil, err
			}
			s.current = nil
			if len(batch) > 0 {
				return batch, nil
			}
		}

		if s.next >= len(s.artifacts) {
			return nil, io.EOF
		}
		artifact := s.artifacts[s.next]
		s.next++

		if artifact.Kind != ArtifactKindSidekickStorage {
			continue
		}

		contents, err := s.storage.DownloadFile(ctx, BucketRaidLogs, artifact.ObjectKey)
		if errors.Is(err, storage.ErrFileNotFound) {
			s.logger.WarnContext(ctx, "sidekick storage artifact is missing; continuing without positional enhancement",
				"artifact_id", artifact.ID,
				"log_group_id", artifact.LogGroupID,
				"log_file_part_id", artifact.LogFilePartID,
			)
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("download Sidekick storage artifact %s: %w", artifact.ID, err)
		}
		if artifact.SchemaVersion != 1 && artifact.SchemaVersion != 2 && artifact.SchemaVersion != 3 {
			return nil, fmt.Errorf("unsupported Sidekick storage artifact schema version %d", artifact.SchemaVersion)
		}
		decoded, err := (sidekickstorage.Decoder{}).Decode(ctx, bytes.NewReader(contents))
		if err != nil {
			return nil, fmt.Errorf("decode Sidekick storage artifact %s: %w", artifact.ID, err)
		}
		source, ok := decoded.(*sidekickstorage.Source)
		if !ok {
			return nil, fmt.Errorf("unexpected Sidekick storage source type %T", decoded)
		}
		if source.SchemaVersion() != artifact.SchemaVersion {
			return nil, fmt.Errorf("sidekick storage artifact schema version %d does not match payload schema version %d", artifact.SchemaVersion, source.SchemaVersion())
		}
		s.sawUnitResources = s.sawUnitResources || source.SawUnitResources()
		s.sawUnitPosition = s.sawUnitPosition || source.SawUnitPosition()
		s.current = source
	}
}

func (s *sidekickArtifactSource) SawUnitPosition() bool  { return s.sawUnitPosition }
func (s *sidekickArtifactSource) SawUnitResources() bool { return s.sawUnitResources }
