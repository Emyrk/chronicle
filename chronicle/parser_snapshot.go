package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const ArtifactKindParserSnapshot = "parser_snapshot"

// storeParserSnapshot publishes one complete pre-Finalize debug artifact. The
// previous row/object remains valid until the new bytes and generation-fenced
// metadata commit both succeed. This is a debug artifact, not a resume head.
func (c *Chronicle) storeParserSnapshot(ctx context.Context, groupID uuid.UUID, generation, jobID int64, capture func(io.Writer) error) error {
	var contents bytes.Buffer
	gz := gzip.NewWriter(&contents)
	if err := capture(gz); err != nil {
		_ = gz.Close()
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}
	id := uuid.New()
	key := c.artifactPath(groupID, id)
	committed := false
	defer func() {
		if !committed {
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
			defer cancel()
			_, _ = c.Storage.RemoveFile(cleanupCtx, BucketRaidLogs, []string{key})
		}
	}()
	if _, err := c.Storage.UploadFile(ctx, BucketRaidLogs, key, bytes.NewReader(contents.Bytes())); err != nil {
		return fmt.Errorf("upload snapshot: %w", err)
	}
	sum := sha256.Sum256(contents.Bytes())
	now := database.Timestamptz(time.Now())
	var old []database.LogGroupArtifact
	err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		current, err := tx.LockWoWLogGroupParseGeneration(ctx, groupID)
		if err != nil {
			return err
		}
		if !isCurrentParseGeneration(generation, current) {
			return fmt.Errorf("snapshot parse generation superseded")
		}
		old, err = tx.DeleteLogGroupArtifactsByKind(ctx, database.DeleteLogGroupArtifactsByKindParams{LogGroupID: groupID, Kind: ArtifactKindParserSnapshot})
		if err != nil {
			return err
		}
		_, err = tx.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{ID: id, LogGroupID: groupID, Kind: ArtifactKindParserSnapshot, SchemaVersion: 2, Hash: hex.EncodeToString(sum[:]), SizeBytes: int64(contents.Len()), MimeType: "application/gzip", ContentEncoding: pgtype.Text{String: "gzip", Valid: true}, ObjectKey: key, OriginalFilename: pgtype.Text{String: fmt.Sprintf("parser-snapshot-generation-%d-job-%d.json.gz", generation, jobID), Valid: true}, CreatedAt: now, UpdatedAt: now})
		return err
	}, nil)
	if err != nil {
		return err
	}
	committed = true
	for _, artifact := range old {
		if artifact.StorageDeletedAt.Valid {
			continue
		}
		if _, err := c.Storage.RemoveFile(ctx, BucketRaidLogs, []string{artifact.ObjectKey}); err != nil {
			c.logger.WarnContext(ctx, "old parser snapshot object cleanup failed", slog.String("object_key", artifact.ObjectKey), slog.Any("error", err))
		}
	}
	return nil
}
