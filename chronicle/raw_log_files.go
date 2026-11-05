package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const logFilePartReservationTTL = time.Hour

func expireStaleLogFileParts(ctx context.Context, db database.StoreQueries, objectStorage storage.ObjectStorage, fileID uuid.UUID) error {
	stale, err := db.ExpireStaleLogFileParts(ctx, database.ExpireStaleLogFilePartsParams{
		LogFileID:   fileID,
		StaleBefore: database.Timestamptz(time.Now().Add(-logFilePartReservationTTL)),
	})
	if err != nil {
		return fmt.Errorf("expire stale log file parts: %w", err)
	}
	if len(stale) == 0 {
		return nil
	}
	paths := make([]string, 0, len(stale))
	for _, part := range stale {
		paths = append(paths, part.ObjectKey)
	}
	if _, err := objectStorage.RemoveFile(context.WithoutCancel(ctx), BucketRaidLogs, paths); err != nil {
		// Expiration is the correctness boundary. Object deletion is best-effort;
		// group deletion retries cleanup for every recorded part.
		slog.WarnContext(ctx, "failed to remove stale log file part objects", "error", err, "log_file_id", fileID)
	}
	return nil
}

func listReadyLogFileParts(ctx context.Context, db database.StoreQueries, objectStorage storage.ObjectStorage, fileID uuid.UUID) ([]database.LogFilePart, error) {
	if err := expireStaleLogFileParts(ctx, db, objectStorage, fileID); err != nil {
		return nil, err
	}
	parts, err := db.ListReadyLogFileParts(ctx, fileID)
	if err != nil {
		return nil, fmt.Errorf("list ready log file parts: %w", err)
	}
	return parts, nil
}

func loadRawLogFileWithParts(ctx context.Context, objectStorage storage.ObjectStorage, file database.LogFile, parts []database.LogFilePart) (io.Reader, error) {
	combined := &bytes.Buffer{}
	if err := appendRawLogObject(ctx, objectStorage, filepath.Join("logs", file.ID.String()), file.ContentEncoding, combined); err != nil {
		return nil, fmt.Errorf("load base log file %s: %w", file.ID, err)
	}
	for _, part := range parts {
		if err := appendRawLogObject(ctx, objectStorage, part.ObjectKey, part.ContentEncoding, combined); err != nil {
			return nil, fmt.Errorf("load log file part %s: %w", part.ID, err)
		}
	}
	return bytes.NewReader(combined.Bytes()), nil
}

func appendRawLogObject(ctx context.Context, objectStorage storage.ObjectStorage, objectKey string, contentEncoding pgtype.Text, dst io.Writer) error {
	fileData, err := objectStorage.DownloadFile(ctx, BucketRaidLogs, objectKey)
	if err != nil {
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return fmt.Errorf("download object %s (unexpected EOF — file may be truncated): %w", objectKey, err)
		}
		return fmt.Errorf("download object %s: %w", objectKey, err)
	}
	reader := io.Reader(bytes.NewReader(fileData))
	if contentEncoding.Valid && contentEncoding.String == "gzip" {
		gzReader, err := gzip.NewReader(reader)
		if err != nil {
			return fmt.Errorf("decompress object %s: %w", objectKey, err)
		}
		defer func() { _ = gzReader.Close() }()
		reader = gzReader
	}
	if _, err := io.Copy(dst, reader); err != nil {
		return fmt.Errorf("read object %s: %w", objectKey, err)
	}
	return nil
}
