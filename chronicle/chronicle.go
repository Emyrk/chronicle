package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
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
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/pubsub"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/cleanup"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/dustin/go-humanize"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/riverqueue/river/rivertype"
)

// UploadInput represents a combat-log file to be uploaded, potentially gzip-compressed.
type UploadInput struct {
	// Reader provides the raw file data (compressed if IsGzipped is true).
	Reader io.Reader
	// IsGzipped indicates whether the data is gzip-compressed.
	IsGzipped bool
}

const ArtifactKindSidekickStorage = "sidekick-storage"

// ArtifactInput represents a typed artifact that enriches a logical log group.
// Artifacts are persisted independently from combat-log files so reparses can
// reuse them without changing the parser's file-count contract.
type ArtifactInput struct {
	Kind             string
	SchemaVersion    int32
	Reader           io.Reader
	MimeType         string
	OriginalFilename string
}

const (
	BucketRaidLogs      = "raidlogs"
	BucketParseProfiles = "parse-profiles"
	BucketTemporary     = "temporary"
)

type Chronicle struct {
	AppContext         context.Context
	Storage            storage.ObjectStorage
	logger             *slog.Logger
	TemporaryDirectory string
	queue              *riverqueue.Queues
	Zed                *authz.Authz
	ps                 pubsub.Pubsub
	WoWDB              *gamedb.WoWDB
	ItemFetcher        gamedb.GearResolver
	metrics            *logParseMetrics
	emitParsingLogs    bool
	registryMu         sync.Mutex
	registryByFlavor   map[string]*registry.Registry
	parseProfileMu     sync.RWMutex
	primaryDomain      string
	defaultFlavor      database.WoWFlavor
	defaultDatasetID   uuid.UUID
	recordParseAbort   func(context.Context, parseGenerationAbortOutput) error
	resolveDataset     func(ctx context.Context, realmID uuid.UUID) ResolvedDataset

	mu                     sync.Mutex
	insertParsedInstanceMu sync.Mutex
}

type Options struct {
	Storage         storage.ObjectStorage
	Zed             *authz.Authz
	Ps              pubsub.Pubsub
	WoWDB           *gamedb.WoWDB
	Registry        prometheus.Registerer
	EmitParsingLogs bool
	// PrimaryDomain is the root domain (e.g. "chronicleclassic.com") used to
	// build tenant upload URLs in rejection messages.
	PrimaryDomain string
	// DefaultFlavor is the build-tag-derived flavor used for the server's
	// default encounter registry. It is NOT stamped on new log groups;
	// uploads defer to realm-based dataset resolution for flavor.
	DefaultFlavor database.WoWFlavor
	// DefaultDatasetID is the well-known UUID of the default dataset, used
	// when no realm-specific dataset can be resolved.
	DefaultDatasetID uuid.UUID
	// ResolveDataset maps a realm ID to the dataset and its default flavor.
	// The resolver follows the server > tenant > default chain.
	// If nil, the default dataset is always used.
	ResolveDataset func(ctx context.Context, realmID uuid.UUID) ResolvedDataset
}

func New(ctx context.Context, logger *slog.Logger, opts Options) (*Chronicle, error) {
	c := &Chronicle{
		AppContext:         ctx,
		primaryDomain:      opts.PrimaryDomain,
		defaultFlavor:      opts.DefaultFlavor,
		defaultDatasetID:   opts.DefaultDatasetID,
		Storage:            opts.Storage,
		Zed:                opts.Zed,
		ps:                 opts.Ps,
		logger:             logger,
		WoWDB:              opts.WoWDB,
		TemporaryDirectory: filepath.Join(os.TempDir(), "chronicle_uploads"),
		metrics:            newLogParseMetrics(opts.Registry),
		ItemFetcher:        opts.WoWDB,
		emitParsingLogs:    opts.EmitParsingLogs,
		registryByFlavor:   make(map[string]*registry.Registry),
		resolveDataset:     opts.ResolveDataset,
	}

	err := c.initStorage(ctx)
	if err != nil {
		return nil, fmt.Errorf("init storage: %w", err)
	}

	_ = c.clearTemporaryFiles()
	return c, nil
}

func (c *Chronicle) EmitParsingLogs() bool {
	return c.emitParsingLogs
}

// RegistryForFlavor returns the instance registry for the given flavor.
// Registries are lazily created and cached by a canonical key derived from
// the sorted, deduplicated flavor tags.
func (c *Chronicle) RegistryForFlavor(flavor database.WoWFlavor) *registry.Registry {
	key := flavor.CanonicalKey()

	c.registryMu.Lock()
	defer c.registryMu.Unlock()

	if reg, ok := c.registryByFlavor[key]; ok {
		return reg
	}

	reg := registry.RegistryForFlavor(c.logger, flavor)
	c.registryByFlavor[key] = reg
	return reg
}

// Registry returns the default instance registry (for the server's compiled-in
// flavor). Used by code paths that don't have a resolved flavor yet.
func (c *Chronicle) Registry() *registry.Registry {
	return c.RegistryForFlavor(c.defaultFlavor)
}

// ResolvedDataset holds the dataset ID, its default flavor, and additive
// tenant flavor tags resolved for a realm.
type ResolvedDataset struct {
	DatasetID        uuid.UUID
	Flavor           database.WoWFlavor
	AdditionalFlavor database.WoWFlavor
}

// resolveForRealm resolves the dataset and flavor for a realm. When the
// resolver is nil (tests, CLI), returns the default dataset with the
// build-tag-derived default flavor.
func (c *Chronicle) resolveForRealm(ctx context.Context, realmID uuid.UUID) ResolvedDataset {
	if c.resolveDataset == nil {
		return ResolvedDataset{DatasetID: c.defaultDatasetID, Flavor: c.defaultFlavor}
	}
	return c.resolveDataset(ctx, realmID)
}

func (c *Chronicle) SetQueue(queue *riverqueue.Queues) {
	c.queue = queue
}

func (c *Chronicle) logPath(fileID uuid.UUID) string {
	return filepath.Join("logs", fileID.String())
}

func (c *Chronicle) artifactPath(logGroupID, artifactID uuid.UUID) string {
	return filepath.Join("artifacts", logGroupID.String(), artifactID.String())
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

	_, err = c.Storage.CreateBucket(ctx, BucketParseProfiles, storage.BucketOptions{
		Public:           false,
		AllowedMimeTypes: []string{"application/octet-stream"},
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

// UploadMeta carries optional caller-chosen overrides for a log group's parse
// axes. The frontend picks these from the build tag (and, later, the tenant)
// because the realm — and thus a server-side resolution — is not known until
// after parsing. Empty fields fall back to server-side derivation: Format from
// logType, Flavor from the build-tag default.
type UploadMeta struct {
	Format   database.LogFormat
	Flavor   database.WoWFlavor
	Unlisted bool
}

func (c *Chronicle) UploadLogs(ctx context.Context, inputs []UploadInput, artifacts []ArtifactInput, logType database.LogType, realmID uuid.UUID, meta UploadMeta) (*database.WoWLogGroup, []database.LogFile, error) {
	clean := cleanup.New()
	defer clean.Do()

	if len(inputs) == 0 {
		return nil, nil, fmt.Errorf("at least one file is required")
	}

	now := time.Now()
	cl, ok := chronauth.AuthenticatedClaims(ctx)
	if !ok {
		return nil, nil, fmt.Errorf("upload file, no authenticated user")
	}

	user, err := c.Zed.GetUserByID(ctx, cl.Subject)
	if err != nil {
		return nil, nil, fmt.Errorf("fetch user: %w", err)
	}
	if user.ConsumedStorageBytes > user.MaxStorageBytes {
		return nil, nil, httpapi.NewAPIError(
			fmt.Errorf("storage limit exceeded"),
			fmt.Sprintf("Reached storage limit of %s bytes, delete log files to free up space", humanize.Bytes(uint64(user.MaxStorageBytes))),
			http.StatusBadRequest)
	}

	// Save the files locally to disk first, then upload them to object storage.
	// This allows us to hash them and store in the database first, and keep them tracked.
	tmpIDs := make([]uuid.UUID, len(inputs))
	for i := range tmpIDs {
		tmpIDs[i] = uuid.New()
	}

	//nolint:errcheck
	defer c.clearTemporaryFiles()
	c.mu.Lock()
	defer c.mu.Unlock()
	hashes := make([]string, 0, len(tmpIDs))
	tmpFiles := make([]*os.File, 0, len(tmpIDs))
	dbFiles := make([]database.LogFile, 0, len(tmpIDs))
	// Track file metadata for each upload
	type fileMeta struct {
		originalSize   int64
		compressedSize *int64 // nil if not compressed
		contentEnc     *string
	}
	fileMetas := make([]fileMeta, 0, len(tmpIDs))

	for i, tmp := range tmpIDs {
		input := inputs[i]
		tmpPath := filepath.Join(c.TemporaryDirectory, tmp.String())
		f, err := os.Create(tmpPath)
		if err != nil {
			return nil, nil, fmt.Errorf("create temp file: %w", err)
		}
		//nolint:errcheck
		defer f.Close()
		tmpFiles = append(tmpFiles, f)

		var h = sha256.New()
		var meta fileMeta

		if input.IsGzipped {
			// For gzipped input: store compressed data but compute hash of
			// decompressed content for deduplication.

			// Write compressed data to temp file
			written, err := io.Copy(f, input.Reader)
			if err != nil {
				return nil, nil, fmt.Errorf("write compressed temp file: %w", err)
			}

			// Sync and seek back
			if err := f.Sync(); err != nil {
				return nil, nil, fmt.Errorf("flush temp file: %w", err)
			}
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				return nil, nil, fmt.Errorf("seek temp file: %w", err)
			}

			// Decompress from temp file to compute hash of original content
			gzReader, err := gzip.NewReader(f)
			if err != nil {
				return nil, nil, fmt.Errorf("create gzip reader for hashing: %w", err)
			}

			// Count original bytes while hashing
			originalCounter := &countingWriter{w: io.Discard}
			hashWriter := io.MultiWriter(h, originalCounter)
			if _, err := io.Copy(hashWriter, gzReader); err != nil {
				_ = gzReader.Close()
				return nil, nil, fmt.Errorf("hash decompressed content: %w", err)
			}
			_ = gzReader.Close()

			// Seek back for storage upload
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				return nil, nil, fmt.Errorf("seek temp file for upload: %w", err)
			}

			meta.originalSize = originalCounter.count
			meta.compressedSize = ptr.Ref(written)
			meta.contentEnc = ptr.Ref("gzip")
		} else {
			// Uncompressed: write to file and hash simultaneously
			writer := io.MultiWriter(f, h)
			if _, err := io.Copy(writer, input.Reader); err != nil {
				return nil, nil, fmt.Errorf("write temp file: %w", err)
			}

			if err := f.Sync(); err != nil {
				return nil, nil, fmt.Errorf("flush temp file: %w", err)
			}

			// Get file size
			info, err := f.Stat()
			if err != nil {
				return nil, nil, fmt.Errorf("stat temp file: %w", err)
			}

			// Reset so it can be read back
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				return nil, nil, fmt.Errorf("seek temp file: %w", err)
			}

			meta.originalSize = info.Size()
			meta.compressedSize = nil
			meta.contentEnc = nil
		}

		hashes = append(hashes, hex.EncodeToString(h.Sum(nil)))
		fileMetas = append(fileMetas, meta)
	}

	artifactIDs := make([]uuid.UUID, len(artifacts))
	artifactHashes := make([]string, 0, len(artifacts))
	artifactSizes := make([]int64, 0, len(artifacts))
	artifactFiles := make([]*os.File, 0, len(artifacts))
	for i, artifact := range artifacts {
		if artifact.Kind == "" {
			return nil, nil, fmt.Errorf("artifact kind is required")
		}
		if artifact.SchemaVersion <= 0 {
			return nil, nil, fmt.Errorf("artifact %q has invalid schema version %d", artifact.Kind, artifact.SchemaVersion)
		}
		if artifact.MimeType == "" {
			return nil, nil, fmt.Errorf("artifact %q MIME type is required", artifact.Kind)
		}

		artifactIDs[i] = uuid.New()
		tmpPath := filepath.Join(c.TemporaryDirectory, artifactIDs[i].String())
		f, err := os.Create(tmpPath)
		if err != nil {
			return nil, nil, fmt.Errorf("create artifact temp file: %w", err)
		}
		//nolint:errcheck
		defer f.Close()

		h := sha256.New()
		written, err := io.Copy(io.MultiWriter(f, h), artifact.Reader)
		if err != nil {
			return nil, nil, fmt.Errorf("write artifact temp file: %w", err)
		}
		if err := f.Sync(); err != nil {
			return nil, nil, fmt.Errorf("flush artifact temp file: %w", err)
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return nil, nil, fmt.Errorf("seek artifact temp file: %w", err)
		}

		artifactFiles = append(artifactFiles, f)
		artifactHashes = append(artifactHashes, hex.EncodeToString(h.Sum(nil)))
		artifactSizes = append(artifactSizes, written)
	}

	incomingStorageBytes := int64(0)
	for _, meta := range fileMetas {
		if meta.compressedSize != nil {
			incomingStorageBytes += *meta.compressedSize
		} else {
			incomingStorageBytes += meta.originalSize
		}
	}
	for _, size := range artifactSizes {
		incomingStorageBytes += size
	}
	if user.ConsumedStorageBytes+incomingStorageBytes > user.MaxStorageBytes {
		return nil, nil, httpapi.NewAPIError(
			fmt.Errorf("storage limit exceeded"),
			fmt.Sprintf("This upload would exceed the storage limit of %s; delete log files to free up space", humanize.Bytes(uint64(user.MaxStorageBytes))),
			http.StatusBadRequest,
		)
	}

	// Check for duplicate files (only relevant when uploading multiple files)
	if len(hashes) > 1 {
		seen := make(map[string]bool, len(hashes))
		for _, h := range hashes {
			if seen[h] {
				return nil, nil, fmt.Errorf("the same file was uploaded twice; please upload different log files")
			}
			seen[h] = true
		}
	}

	var group database.WoWLogGroup
	// tmpFiles and hashes are the files that were uploaded now on local disk.
	err = c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if _, err := tx.LockUserStorageQuota(ctx, cl.Subject); err != nil {
			return fmt.Errorf("lock upload owner storage quota: %w", err)
		}
		lockedUser, quotaErr := tx.GetUserByID(ctx, cl.Subject)
		if quotaErr != nil {
			return fmt.Errorf("fetch locked upload owner storage quota: %w", quotaErr)
		}
		if lockedUser.ConsumedStorageBytes+incomingStorageBytes > lockedUser.MaxStorageBytes {
			return httpapi.NewAPIError(
				fmt.Errorf("storage limit exceeded"),
				fmt.Sprintf("This upload would exceed the storage limit of %s; delete log files to free up space", humanize.Bytes(uint64(lockedUser.MaxStorageBytes))),
				http.StatusBadRequest,
			)
		}

		// Insert the log group
		var err error
		// Resolve the parse axes, preferring caller-supplied overrides (the
		// frontend's build-tag/tenant choice) and falling back to server-side
		// derivation.
		format := logType.Format()
		if meta.Format != "" {
			format = meta.Format
		}
		// Flavor is not pre-stamped; the parser resolves it from the
		// dataset's default_flavor after realm detection. An explicit
		// override (admin upload) is still honoured.
		var flavor database.WoWFlavor
		if meta.Flavor != nil {
			flavor = meta.Flavor
		}

		group, err = tx.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:    uuid.New(),
			Owner: cl.Subject,
			// log_type stays the persisted source for now; format is dual-written
			// so consumers can read the format axis directly and we can later flip
			// format to the source of truth.
			LogType: logType,
			Format:  database.NullLogFormat{LogFormat: format, Valid: format.Valid()},
			// flavor is the server's identity, independent of log_type. nil leaves
			// the column NULL.
			Flavor:    flavor.Strings(),
			Unlisted:  meta.Unlisted,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		if err != nil {
			return err
		}

		// Insert the combat-log files.
		for i := range hashes {
			meta := fileMetas[i]

			dbFile, err := tx.InsertLogFile(ctx, database.InsertLogFileParams{
				ID:                  tmpIDs[i],
				Owner:               cl.Subject,
				Hash:                hashes[i],
				WowLogID:            group.ID,
				SizeBytes:           meta.originalSize,
				MimeType:            "text/plain;charset=UTF-8", // logs are only plaintext
				CompressedSizeBytes: database.Int8(meta.compressedSize),
				ContentEncoding:     database.Text(meta.contentEnc),
				CreatedAt:           database.Timestamptz(now),
				UpdatedAt:           database.Timestamptz(now),
			})
			if err != nil {
				if database.IsUniqueViolation(err, database.UniqueFilesUniqueOwnerHash) {
					return httpapi.NewAPIError(
						fmt.Errorf("file with same hash already exists"), // Hide the sql error
						"A log file with the same contents has already been uploaded by you",
						http.StatusBadRequest).
						CTA("Log files cannot be uploaded multiple times, delete the conflicting log upload or choose another one.").
						Link("Conflicting Log file", "/logs/file/"+hashes[i])
				}
				return err
			}
			dbFiles = append(dbFiles, dbFile)
		}

		for i, artifact := range artifacts {
			var originalFilename *string
			if artifact.OriginalFilename != "" {
				originalFilename = ptr.Ref(artifact.OriginalFilename)
			}
			_, err := tx.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
				ID:               artifactIDs[i],
				LogGroupID:       group.ID,
				Kind:             artifact.Kind,
				SchemaVersion:    artifact.SchemaVersion,
				Hash:             artifactHashes[i],
				SizeBytes:        artifactSizes[i],
				MimeType:         artifact.MimeType,
				ObjectKey:        c.artifactPath(group.ID, artifactIDs[i]),
				OriginalFilename: database.Text(originalFilename),
				CreatedAt:        database.Timestamptz(now),
				UpdatedAt:        database.Timestamptz(now),
			})
			if err != nil {
				return fmt.Errorf("insert log group artifact %q: %w", artifact.Kind, err)
			}
		}

		return nil
	}, nil)
	if err != nil {
		return nil, nil, err
	}

	clean.Add(func() { _ = c.Zed.DeleteWoWLogGroup(ctx, group.ID) })

	// Now store the logs in object storage
	for i := range tmpIDs {
		meta := fileMetas[i]
		contentType := "text/plain;charset=UTF-8"
		if meta.contentEnc != nil {
			// Store as gzip with appropriate content type
			contentType = "application/gzip"
		}

		storageObject, err := c.Storage.UploadFile(ctx, BucketRaidLogs, c.logPath(tmpIDs[i]), tmpFiles[i], storage.FileOptions{
			ContentType: ptr.Ref(contentType),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("upload log file to object storage: %w", err)
		}
		clean.Add(func() { _, _ = c.Storage.RemoveFile(ctx, BucketRaidLogs, []string{storageObject.Key}) })
	}

	for i, artifact := range artifacts {
		storageObject, err := c.Storage.UploadFile(ctx, BucketRaidLogs, c.artifactPath(group.ID, artifactIDs[i]), artifactFiles[i], storage.FileOptions{
			ContentType: ptr.Ref(artifact.MimeType),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("upload log group artifact %q to object storage: %w", artifact.Kind, err)
		}
		clean.Add(func() { _, _ = c.Storage.RemoveFile(ctx, BucketRaidLogs, []string{storageObject.Key}) })
	}

	res, err := c.EnqueueParseLog(ctx, group, false, false, realmID)
	if err != nil {
		return nil, nil, fmt.Errorf("enqueue log parse job: %w", err)
	}
	clean.Add(func() { _, _ = c.queue.JobDelete(ctx, res.Job.ID) })

	// All worked! Do not do any cleanup work
	clean.Clear()

	// The combat-log files and artifacts are now fully uploaded in the database and object storage.
	return &group, dbFiles, nil
}

var (
	ErrLogAppendInProgress = errors.New("log append with this upload ID is already in progress")
	ErrUserLogAppendLimit  = errors.New("user log append limit reached")
)

// ErrServerLogAppendInProgress is kept for compatibility with the server upload handler.
var ErrServerLogAppendInProgress = ErrLogAppendInProgress

type LogAppendMeta struct {
	UploadID       uuid.UUID
	SourceSequence pgtype.Int8
}

// ServerLogAppendMeta is retained for compatibility with server upload callers.
type ServerLogAppendMeta = LogAppendMeta

type logAppendOptions struct {
	realmID                  uuid.UUID
	meta                     LogAppendMeta
	maxUserAppends           int64
	enforceOwnerStorageQuota bool
}

func userLogAppendQuotaError(owner database.ChronicleUser, compressedSize int64) error {
	if owner.ConsumedStorageBytes+compressedSize <= owner.MaxStorageBytes {
		return nil
	}
	return httpapi.NewAPIError(
		fmt.Errorf("storage limit exceeded"),
		fmt.Sprintf("This append would exceed the storage limit of %s; delete log files to free up space", humanize.Bytes(uint64(owner.MaxStorageBytes))),
		http.StatusBadRequest,
	)
}

// AppendServerLog stores a server-produced append without a user append limit
// or owner storage quota check.
func (c *Chronicle) AppendServerLog(ctx context.Context, group database.WoWLogGroup, newData io.Reader, realmID uuid.UUID, meta ServerLogAppendMeta) error {
	return c.appendLog(ctx, group, newData, logAppendOptions{realmID: realmID, meta: meta})
}

// AppendUserLog stores a user-produced append. maxAppends <= 0 means unlimited.
// User appends always enforce the owning user's storage quota.
func (c *Chronicle) AppendUserLog(ctx context.Context, group database.WoWLogGroup, newData io.Reader, realmID uuid.UUID, meta LogAppendMeta, maxAppends int64) error {
	return c.appendLog(ctx, group, newData, logAppendOptions{
		realmID:                  realmID,
		meta:                     meta,
		maxUserAppends:           maxAppends,
		enforceOwnerStorageQuota: true,
	})
}

// appendLog stores each append as an immutable object part. PostgreSQL is used
// only for short reservation/finalization transactions; no connection is held
// while the object is uploaded.
func (c *Chronicle) appendLog(ctx context.Context, group database.WoWLogGroup, newData io.Reader, opts logAppendOptions) error {
	meta := opts.meta
	files, err := c.Zed.GetWoWLogFilesByGroupID(ctx, group.ID)
	if err != nil {
		return fmt.Errorf("fetch log files for group %s: %w", group.ID, err)
	}
	if len(files) != 1 {
		return fmt.Errorf("server log group %s requires exactly one logical file, found %d", group.ID, len(files))
	}
	file := files[0]
	if file.StorageDeletedAt.Valid {
		return fmt.Errorf("log file storage was deleted at %s", file.StorageDeletedAt.Time)
	}
	if meta.UploadID == uuid.Nil {
		meta.UploadID = uuid.New()
	}
	if err := expireStaleLogFileParts(ctx, c.Zed, c.Storage, file.ID); err != nil {
		return err
	}

	partID := uuid.New()
	reservationID := uuid.New()
	objectKey := filepath.Join("logs", file.ID.String(), "parts", reservationID.String()+".gz")
	var part database.LogFilePart
	if err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if _, err := tx.LockLogFilePartSequence(ctx, file.ID); err != nil {
			return fmt.Errorf("lock log file part sequence: %w", err)
		}
		var reserveErr error
		part, reserveErr = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
			PartID:                partID,
			LogFileID:             file.ID,
			UploadID:              meta.UploadID,
			ReservationID:         reservationID,
			SourceSequence:        meta.SourceSequence,
			ObjectKey:             objectKey,
			CountsTowardUserLimit: opts.maxUserAppends > 0,
		})
		if reserveErr != nil {
			return reserveErr
		}
		if opts.maxUserAppends > 0 {
			count, countErr := tx.CountUserLogFileParts(ctx, file.ID)
			if countErr != nil {
				return fmt.Errorf("count user log file parts: %w", countErr)
			}
			if count > opts.maxUserAppends {
				return ErrUserLogAppendLimit
			}
		}
		return nil
	}, nil); err != nil {
		return fmt.Errorf("reserve log part: %w", err)
	}
	if part.Status == "ready" {
		return nil
	}
	if part.ReservationID != reservationID {
		return ErrLogAppendInProgress
	}

	finalized := false
	uploaded := false
	defer func() {
		if finalized {
			return
		}
		cleanupCtx := context.WithoutCancel(ctx)
		_ = c.Zed.MarkLogFilePartFailed(cleanupCtx, database.MarkLogFilePartFailedParams{
			ID:            part.ID,
			ReservationID: reservationID,
		})
		current, err := c.Zed.GetLogFilePart(cleanupCtx, part.ID)
		if err != nil {
			// A commit error can be ambiguous. Never delete an object unless the
			// database confirms that this reservation did not finalize.
			return
		}
		if current.Status == "ready" && current.ReservationID == reservationID {
			return
		}
		if uploaded {
			if _, err := c.Storage.RemoveFile(cleanupCtx, BucketRaidLogs, []string{part.ObjectKey}); err != nil {
				slog.WarnContext(cleanupCtx, "failed to remove unfinalized log file part", "error", err, "part_id", part.ID)
			}
		}
	}()

	compressed, err := io.ReadAll(newData)
	if err != nil {
		return fmt.Errorf("read server log part: %w", err)
	}
	gzr, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return fmt.Errorf("open server log part gzip: %w", err)
	}
	decompressedSize, err := io.Copy(io.Discard, gzr)
	_ = gzr.Close()
	if err != nil {
		return fmt.Errorf("read server log part gzip: %w", err)
	}
	h := sha256.Sum256(compressed)
	partHash := hex.EncodeToString(h[:])
	compressedSize := int64(len(compressed))

	if opts.enforceOwnerStorageQuota {
		owner, err := c.Zed.GetUserByID(ctx, group.Owner)
		if err != nil {
			return fmt.Errorf("fetch log owner for storage quota: %w", err)
		}
		if err := userLogAppendQuotaError(owner, compressedSize); err != nil {
			return err
		}
	}

	if _, err := c.Storage.UploadFile(ctx, BucketRaidLogs, part.ObjectKey, bytes.NewReader(compressed),
		storage.FileOptions{ContentType: ptr.Ref("application/gzip")}); err != nil {
		return fmt.Errorf("upload server log part: %w", err)
	}
	uploaded = true

	if err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if opts.enforceOwnerStorageQuota {
			if _, err := tx.LockUserStorageQuota(ctx, group.Owner); err != nil {
				return fmt.Errorf("lock log owner storage quota: %w", err)
			}
			owner, err := tx.GetUserByID(ctx, group.Owner)
			if err != nil {
				return fmt.Errorf("fetch locked log owner storage quota: %w", err)
			}
			if err := userLogAppendQuotaError(owner, compressedSize); err != nil {
				return err
			}
		}
		_, finalizeErr := tx.FinalizeLogFilePart(ctx, database.FinalizeLogFilePartParams{
			ID:                  part.ID,
			ReservationID:       reservationID,
			Hash:                pgtype.Text{String: partHash, Valid: true},
			SizeBytes:           database.Int8(&decompressedSize),
			CompressedSizeBytes: database.Int8(&compressedSize),
			ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
		})
		if errors.Is(finalizeErr, pgx.ErrNoRows) {
			existing, getErr := tx.GetLogFilePart(ctx, part.ID)
			if getErr == nil && existing.Status == "ready" && existing.ReservationID == reservationID {
				return nil
			}
		}
		if finalizeErr != nil {
			return fmt.Errorf("finalize server log part: %w", finalizeErr)
		}
		if err := tx.AddReadyLogFilePartSizes(ctx, database.AddReadyLogFilePartSizesParams{
			ID:                  file.ID,
			SizeBytes:           decompressedSize,
			CompressedSizeBytes: database.Int8(&compressedSize),
		}); err != nil {
			return fmt.Errorf("update logical log file sizes: %w", err)
		}
		pgxTx, ok := tx.PGXTx()
		if !ok {
			return errors.New("server log part transaction does not expose pgx transaction")
		}
		if _, err := c.enqueueReParseLog(ctx, tx, pgxTx, group.ID, false, false, false, opts.realmID); err != nil {
			return fmt.Errorf("enqueue reparse after server log part: %w", err)
		}
		return nil
	}, nil); err != nil {
		return err
	}
	finalized = true
	return nil
}

// countingWriter wraps a writer and counts bytes written

type countingWriter struct {
	w     io.Writer
	count int64
}

func (c *countingWriter) Write(p []byte) (n int, err error) {
	n, err = c.w.Write(p)
	c.count += int64(n)
	return
}

func (c *Chronicle) WoWLogGroup(ctx context.Context, groupID uuid.UUID) (*chroniclesdk.WoWLogGroupState, error) {
	group, err := c.Zed.GetWoWLogGroupByID(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("fetch log group: %w", err)
	}

	artifacts, err := c.Zed.GetLogGroupArtifacts(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("fetch log group artifacts: %w", err)
	}

	list, err := c.ListLogGroupJobs(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("fetch log parse jobs: %w", err)
	}

	var jobStatus chroniclesdk.JobStatus
	if len(list.Jobs) > 0 {
		jobStatus = db2sdk.JobStatus(*(list.Jobs[0]))
	} else {
		jobStatus = chroniclesdk.JobStatus{
			ID:          0,
			Attempt:     0,
			MaxAttempts: 0,
			State:       rivertype.JobStateDiscarded,
			CreatedAt:   time.Time{},
			ScheduledAt: time.Time{},
			AttemptedAt: nil,
			FinalizedAt: nil,
			Errors:      []rivertype.AttemptError{},
			Kind:        KindLogParse,
			Output:      nil,
		}

		// When no job exists (e.g. River purged old completed jobs), fetch
		// instances directly from the database so the frontend can still
		// display them.
		dbInstances, err := c.Zed.GetInstancesByLogGroupID(ctx, groupID)
		if err == nil && len(dbInstances) > 0 {
			parsed := chroniclesdk.WoWParsedLogJobOutput{
				Instances: make([]chroniclesdk.WoWSimpleParsedInstance, 0, len(dbInstances)),
			}
			for _, inst := range dbInstances {
				encounters, err := c.Zed.EncountersByInstanceID(ctx, inst.ID)
				if err != nil {
					continue
				}
				sdkEncounters := make([]chroniclesdk.WoWEncounter, 0, len(encounters))
				for _, e := range encounters {
					sdkEncounters = append(sdkEncounters, db2sdk.WoWEncounter(e))
				}
				parsed.Instances = append(parsed.Instances, chroniclesdk.WoWSimpleParsedInstance{
					WoWInstance: db2sdk.WoWInstance(inst),
					Encounters:  sdkEncounters,
				})
			}
			if outputJSON, err := json.Marshal(parsed); err == nil {
				jobStatus.Output = outputJSON
			}
		}
	}

	sdkGroup := db2sdk.WoWLogGroupRow(group)
	for i := range sdkGroup.Files {
		parts, err := c.Zed.ListFinalizedLogFileParts(ctx, sdkGroup.Files[i].ID)
		if err != nil {
			return nil, fmt.Errorf("fetch finalized parts for log file %s: %w", sdkGroup.Files[i].ID, err)
		}
		sdkGroup.Files[i].Parts = slice.List(parts, db2sdk.WoWLogFilePart)
	}
	sdkGroup.Artifacts = slice.List(artifacts, db2sdk.WoWLogArtifact)
	return &chroniclesdk.WoWLogGroupState{
		WoWLogGroup: sdkGroup,
		Status:      jobStatus,
	}, nil
}

func (c *Chronicle) InvalidateWoWLogGroup(ctx context.Context, logID uuid.UUID, reason string) error {
	if _, err := c.Zed.GetWoWLogGroupByID(ctx, logID); err != nil {
		return fmt.Errorf("load log group: %w", err)
	}
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logID)
	if err != nil {
		return fmt.Errorf("load ranking run identities: %w", err)
	}
	if err := c.Zed.InvalidateWoWLogGroup(ctx, database.InvalidateWoWLogGroupParams{
		LogGroupID: logID,
		Reason:     reason,
	}); err != nil {
		return fmt.Errorf("invalidate log group: %w", err)
	}

	if err := c.Zed.DeleteParseScoreMembershipsByLogGroup(ctx, logID); err != nil {
		return fmt.Errorf("delete invalidated DPS/HPS parse memberships: %w", err)
	}
	if err := c.Zed.DeleteTimeParseClearTimeMembershipsByLogGroup(ctx, logID); err != nil {
		return fmt.Errorf("delete invalidated clear-time memberships: %w", err)
	}
	if err := c.Zed.DeleteTimeParseBossKillMembershipsByLogGroup(ctx, logID); err != nil {
		return fmt.Errorf("delete invalidated boss-kill memberships: %w", err)
	}

	runIDs := make([]uuid.UUID, 0, len(identities))
	for _, identity := range identities {
		runIDs = append(runIDs, identity.RunID)
	}
	replacementLogGroups, err := c.Zed.ListTimeParseReplacementLogGroupsForDeletedLogGroup(ctx, database.ListTimeParseReplacementLogGroupsForDeletedLogGroupParams{
		RunIds: runIDs, LogGroupID: logID,
	})
	if err != nil {
		return fmt.Errorf("load time-parse replacement log groups: %w", err)
	}
	for _, replacementLogGroup := range replacementLogGroups {
		if refreshErr := c.refreshParseScoreMemberships(ctx, replacementLogGroup); refreshErr != nil {
			return fmt.Errorf("refresh DPS/HPS parse memberships for replacement log group: %w", refreshErr)
		}
		if _, refreshErr := c.Zed.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
			LogGroupID: replacementLogGroup, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		}); refreshErr != nil {
			return fmt.Errorf("refresh clear-time memberships after log invalidation: %w", refreshErr)
		}
		if _, refreshErr := c.Zed.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
			LogGroupID: replacementLogGroup, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		}); refreshErr != nil {
			return fmt.Errorf("refresh boss-kill memberships after log invalidation: %w", refreshErr)
		}
	}

	if err := c.EnqueueRankingRunRefresh(ctx, rankingRunLogGroupIdentitySeeds(identities)...); err != nil {
		slog.WarnContext(ctx, "failed to enqueue ranking run refresh after log invalidation", slog.Any("error", err))
	}
	return nil
}

func (c *Chronicle) ClearWoWLogGroupInvalidation(ctx context.Context, logID uuid.UUID) error {
	if _, err := c.Zed.GetWoWLogGroupByID(ctx, logID); err != nil {
		return fmt.Errorf("load log group: %w", err)
	}
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logID)
	if err != nil {
		return fmt.Errorf("load ranking run identities: %w", err)
	}
	if err := c.Zed.ClearWoWLogGroupInvalidation(ctx, logID); err != nil {
		return fmt.Errorf("clear log group invalidation: %w", err)
	}

	if err := c.refreshParseScoreMemberships(ctx, logID); err != nil {
		return fmt.Errorf("restore DPS/HPS parse memberships after clearing invalidation: %w", err)
	}
	if _, err := c.Zed.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
		LogGroupID: logID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	}); err != nil {
		return fmt.Errorf("restore clear-time memberships after clearing invalidation: %w", err)
	}
	if _, err := c.Zed.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
		LogGroupID: logID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	}); err != nil {
		return fmt.Errorf("restore boss-kill memberships after clearing invalidation: %w", err)
	}

	if err := c.EnqueueRankingRunRefresh(ctx, rankingRunLogGroupIdentitySeeds(identities)...); err != nil {
		slog.WarnContext(ctx, "failed to enqueue ranking run refresh after clearing log invalidation", slog.Any("error", err))
	}
	return nil
}

func (c *Chronicle) DeleteWoWLogGroup(ctx context.Context, logID uuid.UUID) error {
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logID)
	if err != nil {
		return fmt.Errorf("load ranking run identities: %w", err)
	}
	runIDs := make([]uuid.UUID, 0, len(identities))
	for _, identity := range identities {
		runIDs = append(runIDs, identity.RunID)
	}
	replacementLogGroups, err := c.Zed.ListTimeParseReplacementLogGroupsForDeletedLogGroup(ctx, database.ListTimeParseReplacementLogGroupsForDeletedLogGroupParams{
		RunIds: runIDs, LogGroupID: logID,
	})
	if err != nil {
		return fmt.Errorf("load time-parse replacement log groups: %w", err)
	}

	err = c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		_, err := advanceParseGeneration(ctx, tx, logID, false)
		return err
	}, nil)
	if err != nil {
		return fmt.Errorf("fence log group deletion: %w", err)
	}

	err = c.RemoveWoWLogFilesFromStorage(ctx, logID)
	if err != nil {
		return fmt.Errorf("remove log files from storage: %w", err)
	}

	if err := c.RemoveLogGroupArtifactsFromStorage(ctx, logID); err != nil {
		return fmt.Errorf("remove log group artifacts from storage: %w", err)
	}

	if err := c.RemoveParseCPUProfile(ctx, logID); err != nil {
		return err
	}

	err = c.Zed.DeleteWoWLogGroup(ctx, logID)
	if err != nil {
		return fmt.Errorf("delete log group: %w", err)
	}
	for _, replacementLogGroup := range replacementLogGroups {
		if refreshErr := c.refreshParseScoreMemberships(ctx, replacementLogGroup); refreshErr != nil {
			return fmt.Errorf("refresh DPS/HPS parse memberships for replacement log group: %w", refreshErr)
		}
		if _, refreshErr := c.Zed.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
			LogGroupID: replacementLogGroup, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		}); refreshErr != nil {
			return fmt.Errorf("refresh clear-time memberships after log group deletion: %w", refreshErr)
		}
		if _, refreshErr := c.Zed.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
			LogGroupID: replacementLogGroup, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		}); refreshErr != nil {
			return fmt.Errorf("refresh boss-kill memberships after log group deletion: %w", refreshErr)
		}
	}
	if err := c.EnqueueRankingRunRefresh(ctx, rankingRunLogGroupIdentitySeeds(identities)...); err != nil {
		slog.WarnContext(ctx, "failed to enqueue ranking run refresh after log group deletion", slog.Any("error", err))
	}

	return nil
}

func (c *Chronicle) DeleteWoWLogGroupFiles(ctx context.Context, logID uuid.UUID) error {
	err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		_, err := fenceParseGenerationPreservingFinalized(ctx, tx, logID)
		return err
	}, nil)
	if err != nil {
		return fmt.Errorf("fence log file deletion: %w", err)
	}

	err = c.RemoveWoWLogFilesFromStorage(ctx, logID)
	if err != nil {
		return fmt.Errorf("remove log files from storage: %w", err)
	}

	if err := c.RemoveLogGroupArtifactsFromStorage(ctx, logID); err != nil {
		return fmt.Errorf("remove log group artifacts from storage: %w", err)
	}

	deletedAt := database.Timestamptz(time.Now())
	_, err = c.Zed.DeleteWoWLogGroupFiles(ctx, database.DeleteWoWLogGroupFilesParams{
		StorageDeletedAt: deletedAt,
		WowLogID:         logID,
	})
	if err != nil {
		return fmt.Errorf("delete log group files: %w", err)
	}
	if _, err := c.Zed.MarkLogGroupArtifactsStorageDeleted(ctx, database.MarkLogGroupArtifactsStorageDeletedParams{
		StorageDeletedAt: deletedAt,
		LogGroupID:       logID,
	}); err != nil {
		return fmt.Errorf("delete log group artifacts: %w", err)
	}

	return nil
}

func (c *Chronicle) DeleteWoWLogInstance(ctx context.Context, logID, instanceID uuid.UUID) error {
	identities, err := c.Zed.RankingRunIdentitiesByInstanceIDs(ctx, []uuid.UUID{instanceID})
	if err != nil {
		return fmt.Errorf("load ranking run identity: %w", err)
	}
	replacementLogGroups := make([]uuid.UUID, 0)
	for _, identity := range identities {
		groups, groupErr := c.Zed.ListTimeParseReplacementLogGroups(ctx, database.ListTimeParseReplacementLogGroupsParams{
			RunID: uuid.NullUUID{UUID: identity.RunID, Valid: true}, InstanceID: instanceID,
		})
		if groupErr != nil {
			return fmt.Errorf("load time-parse replacement log groups: %w", groupErr)
		}
		replacementLogGroups = append(replacementLogGroups, groups...)
	}
	_, err = c.Zed.DeleteLogInstanceByIDAndGroup(ctx, database.DeleteLogInstanceByIDAndGroupParams{
		ID:         instanceID,
		LogGroupID: logID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sql.ErrNoRows
		}
		return fmt.Errorf("delete log instance: %w", err)
	}

	if err := c.Zed.DeleteTimeParseClearTimeMembershipsByInstance(ctx, instanceID); err != nil {
		return fmt.Errorf("delete clear-time memberships for instance: %w", err)
	}
	if err := c.Zed.DeleteTimeParseBossKillMembershipsByInstance(ctx, instanceID); err != nil {
		return fmt.Errorf("delete boss-kill memberships for instance: %w", err)
	}

	for _, replacementLogGroup := range replacementLogGroups {
		if refreshErr := c.refreshParseScoreMemberships(ctx, replacementLogGroup); refreshErr != nil {
			return fmt.Errorf("refresh DPS/HPS parse memberships for replacement log group: %w", refreshErr)
		}
		if _, refreshErr := c.Zed.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
			LogGroupID: replacementLogGroup, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		}); refreshErr != nil {
			return fmt.Errorf("refresh clear-time memberships after instance deletion: %w", refreshErr)
		}
		if _, refreshErr := c.Zed.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
			LogGroupID: replacementLogGroup, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
		}); refreshErr != nil {
			return fmt.Errorf("refresh boss-kill memberships after instance deletion: %w", refreshErr)
		}
	}

	err = c.Zed.PruneParsedInstanceFromLogOutput(ctx, database.PruneParsedInstanceFromLogOutputParams{
		InstanceID: instanceID.String(),
		LogGroupID: logID.String(),
	})
	if err != nil {
		return fmt.Errorf("prune deleted instance from output: %w", err)
	}
	if err := c.EnqueueRankingRunRefresh(ctx, rankingRunIdentitySeeds(identities)...); err != nil {
		slog.WarnContext(ctx, "failed to enqueue ranking run refresh after instance deletion", slog.Any("error", err))
	}

	return nil
}

func (c *Chronicle) refreshParseScoreMemberships(ctx context.Context, logGroupID uuid.UUID) error {
	_, err := c.Zed.RefreshParseScoreMembershipsForLogGroup(ctx, database.RefreshParseScoreMembershipsForLogGroupParams{
		LogGroupID: logGroupID, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
	})
	return err
}

// DownloadLogicalLogFile returns the base object plus all finalized append parts
// as one logical download. Gzip members are concatenated without recompression.
func (c *Chronicle) DownloadLogicalLogFile(ctx context.Context, file database.LogFile) ([]byte, bool, error) {
	parts, err := listReadyLogFileParts(ctx, c.Zed, c.Storage, file.ID)
	if err != nil {
		return nil, false, err
	}
	isGzip := file.ContentEncoding.Valid && file.ContentEncoding.String == "gzip"
	if !isGzip {
		reader, err := loadRawLogFileWithParts(ctx, c.Storage, file, parts)
		if err != nil {
			return nil, false, err
		}
		contents, err := io.ReadAll(reader)
		return contents, false, err
	}

	contents, err := c.Storage.DownloadFile(ctx, BucketRaidLogs, c.logPath(file.ID))
	if err != nil {
		return nil, true, fmt.Errorf("download base log object: %w", err)
	}
	var combined bytes.Buffer
	_, _ = combined.Write(contents)
	for _, part := range parts {
		partBytes, err := c.Storage.DownloadFile(ctx, BucketRaidLogs, part.ObjectKey)
		if err != nil {
			return nil, true, fmt.Errorf("download log part %s: %w", part.ID, err)
		}
		_, _ = combined.Write(partBytes)
	}
	return combined.Bytes(), true, nil
}

func (c *Chronicle) RemoveLogGroupArtifactsFromStorage(ctx context.Context, logID uuid.UUID) error {
	artifacts, err := c.Zed.ListLogGroupArtifacts(ctx, logID)
	if err != nil {
		return fmt.Errorf("fetch log group artifacts: %w", err)
	}
	if len(artifacts) == 0 {
		return nil
	}

	paths := make([]string, 0, len(artifacts))
	for _, artifact := range artifacts {
		paths = append(paths, artifact.ObjectKey)
	}
	if _, err := c.Storage.RemoveFile(ctx, BucketRaidLogs, paths); err != nil {
		return fmt.Errorf("remove log group artifact objects: %w", err)
	}
	return nil
}

func (c *Chronicle) RemoveWoWLogFilesFromStorage(ctx context.Context, logID uuid.UUID) error {
	files, err := c.Zed.GetWoWLogFilesByGroupID(ctx, logID)
	if err != nil {
		return fmt.Errorf("fetch log files: %w", err)
	}

	for _, file := range files {
		paths := []string{c.logPath(file.ID)}
		parts, err := c.Zed.ListLogFilePartsForDeletion(ctx, file.ID)
		if err != nil {
			return fmt.Errorf("fetch log file parts for deletion: %w", err)
		}
		for _, part := range parts {
			paths = append(paths, part.ObjectKey)
		}
		if _, err := c.Storage.RemoveFile(ctx, BucketRaidLogs, paths); err != nil {
			return fmt.Errorf("remove file objects: %w", err)
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
