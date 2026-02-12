package chronicle

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/cleanup"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
)

const (
	BucketRaidLogs  = "raidlogs"
	BucketTemporary = "temporary"
)

type Chronicle struct {
	AppContext         context.Context
	Storage            storage.ObjectStorage
	logger             *slog.Logger
	TemporaryDirectory string
	queue              *riverqueue.Queues
	Zed                *authz.Authz

	mu sync.Mutex
}

type Options struct {
	Storage storage.ObjectStorage
	Zed     *authz.Authz
}

func New(ctx context.Context, logger *slog.Logger, opts Options) (*Chronicle, error) {
	c := &Chronicle{
		AppContext:         ctx,
		Storage:            opts.Storage,
		Zed:                opts.Zed,
		logger:             logger,
		TemporaryDirectory: filepath.Join(os.TempDir(), "chronicle_uploads"),
	}

	err := c.initStorage(ctx)
	if err != nil {
		return nil, fmt.Errorf("init storage: %w", err)
	}

	_ = c.clearTemporaryFiles()
	return c, nil
}

func (c *Chronicle) SetQueue(queue *riverqueue.Queues) {
	c.queue = queue
}

func (c *Chronicle) logPath(fileID uuid.UUID) string {
	return filepath.Join("logs", fileID.String())
}

func (c *Chronicle) initStorage(ctx context.Context) error {
	raidLogMimes := []string{"text/plain", "text/plain;charset=UTF-8"}
	_, err := c.Storage.CreateBucket(ctx, BucketRaidLogs, storage.BucketOptions{
		Public:           false,
		AllowedMimeTypes: raidLogMimes,
	})
	if err != nil && err.Error() != "The resource already exists" {
		return err
	}

	_, err = c.Storage.CreateBucket(ctx, BucketTemporary, storage.BucketOptions{
		Public:           false,
		AllowedMimeTypes: raidLogMimes,
	})
	if err != nil && err.Error() != "The resource already exists" {
		return err
	}
	return nil
}

func (c *Chronicle) UploadLogs(ctx context.Context, one, two io.Reader) (*database.WoWLogGroup, []database.LogFile, error) {
	clean := cleanup.New()
	defer clean.Do()

	now := time.Now()
	cl, ok := chronauth.AuthenticatedClaims(ctx)
	if !ok {
		return nil, nil, fmt.Errorf("upload file, no authenticated user")
	}

	user, err := c.Zed.GetUserByID(ctx, cl.Subject)
	if err != nil {
		return nil, nil, fmt.Errorf("fetch user: %w", err)
	}
	if user.ConsumedStorageBytes > user.MaxStorageBytes.Int64 {
		return nil, nil, httpapi.NewAPIError(
			fmt.Errorf("storage limit exceeded"),
			fmt.Sprintf("Reached storage limit of %d bytes, delete log files to free up space", user.MaxStorageBytes.Int64),
			http.StatusBadRequest)
	}

	// Save the files locally to disk first, then upload them to object storage.
	// This allows us to hash them and store in the database first, and keep them tracked.
	tmpIDs := []uuid.UUID{uuid.New(), uuid.New()}

	//nolint:errcheck
	defer c.clearTemporaryFiles()
	c.mu.Lock()
	defer c.mu.Unlock()
	rdrs := []io.Reader{one, two}
	hashes := make([]string, 0, len(tmpIDs))
	tmpFiles := make([]*os.File, 0, len(tmpIDs))
	dbFiles := make([]database.LogFile, 0, len(tmpIDs))

	for i, tmp := range tmpIDs {
		rdr := rdrs[i]
		tmpPath := filepath.Join(c.TemporaryDirectory, tmp.String())
		f, err := os.Create(tmpPath)
		if err != nil {
			return nil, nil, fmt.Errorf("create temp file: %w", err)
		}
		//nolint:errcheck
		defer f.Close()
		tmpFiles = append(tmpFiles, f)

		var h = sha256.New()
		writer := io.MultiWriter(f, h)

		if _, err := io.Copy(writer, rdr); err != nil {
			return nil, nil, fmt.Errorf("write temp file: %w", err)
		}

		err = tmpFiles[i].Sync()
		if err != nil {
			return nil, nil, fmt.Errorf("flush temp file: %w", err)
		}

		// Reset so it can be read back
		_, err = tmpFiles[i].Seek(0, io.SeekStart)
		if err != nil {
			return nil, nil, fmt.Errorf("seek temp file: %w", err)
		}

		hashes = append(hashes, hex.EncodeToString(h.Sum(nil)))
	}

	if hashes[0] == hashes[1] {
		return nil, nil, fmt.Errorf("the same file was uploaded twice; please upload two different log files")
	}

	var group database.WoWLogGroup
	// tmpFiles and hashes are the files that were uploaded now on local disk.
	err = c.Zed.InTx(func(tx *authz.AuthzTX) error {
		// Insert the log grouo
		var err error
		group, err = tx.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:        uuid.New(),
			Owner:     cl.Subject,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		if err != nil {
			return err
		}

		// Insert both files
		for i := range hashes {
			tmpFile := tmpFiles[i]
			info, err := tmpFile.Stat()
			if err != nil {
				return fmt.Errorf("stat temp file: %w", err)
			}

			dbFile, err := tx.InsertLogFile(ctx, database.InsertLogFileParams{
				ID:        tmpIDs[i],
				Owner:     cl.Subject,
				Hash:      hashes[i],
				WowLogID:  group.ID,
				SizeBytes: info.Size(),
				MimeType:  "text/plain;charset=UTF-8", // logs are only plaintext
				CreatedAt: database.Timestamptz(now),
				UpdatedAt: database.Timestamptz(now),
			})
			if err != nil {
				if database.IsUniqueViolation(err, database.UniqueFilesUniqueOwnerHash) {
					return httpapi.NewAPIError(err,
						"A log file with the same contents has already been uploaded by you",
						http.StatusBadRequest).CTA("Log files cannot be uploaded multiple times, delete the conflicting file or choose another one.")
				}
				return err
			}
			dbFiles = append(dbFiles, dbFile)
		}

		return nil
	}, nil)
	if err != nil {
		return nil, nil, err
	}

	clean.Add(func() { _ = c.Zed.DeleteWoWLogGroup(ctx, group.ID) })

	// Now store the logs in object storage
	for i := range tmpIDs {
		storageObject, err := c.Storage.UploadFile(ctx, BucketRaidLogs, c.logPath(tmpIDs[i]), tmpFiles[i], storage.FileOptions{
			ContentType: ptr.Ref("text/plain;charset=UTF-8"),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("upload log file to object storage: %w", err)
		}
		clean.Add(func() { _, _ = c.Storage.RemoveFile(ctx, BucketRaidLogs, []string{storageObject.Key}) })
	}

	res, err := c.EnqueueParseLog(ctx, group)
	if err != nil {
		return nil, nil, fmt.Errorf("enqueue log parse job: %w", err)
	}
	clean.Add(func() { _, _ = c.queue.JobDelete(ctx, res.Job.ID) })

	// All worked! Do not do any cleanup work
	clean.Clear()

	// Both files are now fully uploaded in the database and object storage
	return &group, dbFiles, nil
}

func (c *Chronicle) WoWLogGroup(ctx context.Context, groupID uuid.UUID) (*chroniclesdk.WoWLogGroupState, error) {
	group, err := c.Zed.GetWoWLogGroupByID(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("fetch log group: %w", err)
	}

	list, err := c.ListLogGroupJobs(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("fetch log parse jobs: %w", err)
	}

	if len(list.Jobs) == 0 {
		return nil, fmt.Errorf("no log parse job found for log group %s", groupID)
	}

	currentJob := list.Jobs[0]
	return &chroniclesdk.WoWLogGroupState{
		WoWLogGroup: db2sdk.WoWLogGroupRow(group),
		Status:      db2sdk.JobStatus(*currentJob),
	}, nil
}

func (c *Chronicle) DeleteWoWLogGroup(ctx context.Context, logID uuid.UUID) error {
	err := c.RemoveWoWLogFilesFromStorage(ctx, logID)
	if err != nil {
		return fmt.Errorf("remove log files from storage: %w", err)
	}

	err = c.Zed.DeleteWoWLogGroup(ctx, logID)
	if err != nil {
		return fmt.Errorf("delete log group: %w", err)
	}

	return nil
}

func (c *Chronicle) DeleteWoWLogGroupFiles(ctx context.Context, logID uuid.UUID) error {
	err := c.RemoveWoWLogFilesFromStorage(ctx, logID)
	if err != nil {
		return fmt.Errorf("remove log files from storage: %w", err)
	}

	_, err = c.Zed.DeleteWoWLogGroupFiles(ctx, database.DeleteWoWLogGroupFilesParams{
		StorageDeletedAt: database.Timestamptz(time.Now()),
		WowLogID:         logID,
	})
	if err != nil {
		return fmt.Errorf("delete log group files: %w", err)
	}

	return nil
}

func (c *Chronicle) RemoveWoWLogFilesFromStorage(ctx context.Context, logID uuid.UUID) error {
	files, err := c.Zed.GetWoWLogFilesByGroupID(ctx, logID)
	if err != nil {
		return fmt.Errorf("fetch log files: %w", err)
	}

	for _, file := range files {
		_, err := c.Storage.RemoveFile(ctx, BucketRaidLogs, []string{c.logPath(file.ID)})
		if err != nil {
			return fmt.Errorf("remove file: %w", err)
		}
	}
	return nil
}

func (c *Chronicle) Close() error {
	return c.clearTemporaryFiles()
}

func (c *Chronicle) clearTemporaryFiles() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	defer func() {
		_ = os.MkdirAll(c.TemporaryDirectory, 0755)
	}()
	return os.RemoveAll(c.TemporaryDirectory)
}
