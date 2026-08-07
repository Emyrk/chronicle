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
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/dustin/go-humanize"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/riverqueue/river/rivertype"
)

// UploadInput represents a file to be uploaded, potentially gzip-compressed.
type UploadInput struct {
	// Reader provides the raw file data (compressed if IsGzipped is true)
	Reader io.Reader
	// IsGzipped indicates whether the data is gzip-compressed
	IsGzipped bool
}

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
	ps                 pubsub.Pubsub
	WoWDB              *gamedb.WoWDB
	ItemFetcher        gamedb.GearResolver
	metrics            *logParseMetrics
	emitParsingLogs    bool
	registryMu         sync.Mutex
	registryByFlavor   map[string]*registry.Registry
	primaryDomain      string
	defaultFlavor      database.WoWFlavor
	defaultDatasetID   uuid.UUID
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

func (c *Chronicle) initStorage(ctx context.Context) error {
	raidLogMimes := []string{"text/plain", "text/plain;charset=UTF-8", "application/gzip", "application/zstd"}
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

// UploadMeta carries optional caller-chosen overrides for a log group's parse
// axes. The frontend picks these from the build tag (and, later, the tenant)
// because the realm — and thus a server-side resolution — is not known until
// after parsing. Empty fields fall back to server-side derivation: Format from
// logType, Flavor from the build-tag default.
type UploadMeta struct {
	Format database.LogFormat
	Flavor database.WoWFlavor
}

func (c *Chronicle) UploadLogs(ctx context.Context, inputs []UploadInput, logType database.LogType, realmID uuid.UUID, meta UploadMeta) (*database.WoWLogGroup, []database.LogFile, error) {
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
		source := input.Reader
		if input.IsGzipped {
			gzReader, err := gzip.NewReader(source)
			if err != nil {
				return nil, nil, fmt.Errorf("create gzip reader for upload: %w", err)
			}
			defer func() { _ = gzReader.Close() }()
			source = gzReader
		}

		// Server-side logs remain gzip so AppendServerLog can concatenate
		// incoming gzip streams without recompressing the complete log.
		contentEncoding, compress := rawLogCompression(logType)
		originalSize, err := compress(f, io.TeeReader(source, h))
		if err != nil {
			return nil, nil, fmt.Errorf("compress uploaded log: %w", err)
		}
		if err := f.Sync(); err != nil {
			return nil, nil, fmt.Errorf("flush temp file: %w", err)
		}

		info, err := f.Stat()
		if err != nil {
			return nil, nil, fmt.Errorf("stat compressed temp file: %w", err)
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return nil, nil, fmt.Errorf("seek compressed temp file: %w", err)
		}

		compressedSize := info.Size()
		meta := fileMeta{
			originalSize:   originalSize,
			compressedSize: &compressedSize,
			contentEnc:     ptr.Ref(contentEncoding),
		}

		hashes = append(hashes, hex.EncodeToString(h.Sum(nil)))
		fileMetas = append(fileMetas, meta)
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
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		if err != nil {
			return err
		}

		// Insert both files
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

		return nil
	}, nil)
	if err != nil {
		return nil, nil, err
	}

	clean.Add(func() { _ = c.Zed.DeleteWoWLogGroup(ctx, group.ID) })

	// Now store the logs in object storage
	for i := range tmpIDs {
		contentType := "application/zstd"
		if fileMetas[i].contentEnc != nil && *fileMetas[i].contentEnc == "gzip" {
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

	res, err := c.EnqueueParseLog(ctx, group, false, false, realmID)
	if err != nil {
		return nil, nil, fmt.Errorf("enqueue log parse job: %w", err)
	}
	clean.Add(func() { _, _ = c.queue.JobDelete(ctx, res.Job.ID) })

	// All worked! Do not do any cleanup work
	clean.Clear()

	// Both files are now fully uploaded in the database and object storage
	return &group, dbFiles, nil
}

// AppendServerLog appends new data to an existing server log group's file.
// Stored server logs use multistream gzip so new chunks can be concatenated
// without recompressing the complete log. After appending, the file record is
// updated and a reparse is enqueued.
func (c *Chronicle) AppendServerLog(ctx context.Context, group database.WoWLogGroup, newData io.Reader, newDataIsGzipped bool, realmID uuid.UUID) error {
	files, err := c.Zed.GetWoWLogFilesByGroupID(ctx, group.ID)
	if err != nil {
		return fmt.Errorf("fetch log files for group %s: %w", group.ID, err)
	}
	if len(files) == 0 {
		return fmt.Errorf("no files found for log group %s", group.ID)
	}
	file := files[0]

	// Download existing file from storage
	existing, err := c.Storage.DownloadFile(ctx, BucketRaidLogs, c.logPath(file.ID))
	if err != nil {
		return fmt.Errorf("download existing log file %s: %w", file.ID, err)
	}

	existingEncoding := ""
	if file.ContentEncoding.Valid {
		existingEncoding = file.ContentEncoding.String
	}
	if existingEncoding != "gzip" {
		reader, err := decompressLog(existing, existingEncoding)
		if err != nil {
			return fmt.Errorf("decompress existing log for append: %w", err)
		}
		existing, err = gzipLogData(reader, false)
		if err != nil {
			return fmt.Errorf("compress existing log for append: %w", err)
		}
	}

	newBytes, err := gzipLogData(newData, newDataIsGzipped)
	if err != nil {
		return fmt.Errorf("prepare appended log data: %w", err)
	}

	// Concatenated gzip streams are decoded transparently as one stream.
	combined := append(existing, newBytes...)

	// Hash the compressed blob (that's what we store & deduplicate)
	h := sha256.Sum256(combined)
	newHash := hex.EncodeToString(h[:])

	// Compute decompressed size for the DB record
	gzr, err := gzip.NewReader(bytes.NewReader(combined))
	if err != nil {
		return fmt.Errorf("open combined gzip for size calculation: %w", err)
	}
	decompressedSize, err := io.Copy(io.Discard, gzr)
	_ = gzr.Close()
	if err != nil {
		return fmt.Errorf("calculate decompressed size: %w", err)
	}

	// Re-upload combined file (overwrites existing key)
	_, err = c.Storage.UploadFile(ctx, BucketRaidLogs, c.logPath(file.ID),
		bytes.NewReader(combined), storage.FileOptions{
			ContentType: ptr.Ref("application/gzip"),
		})
	if err != nil {
		return fmt.Errorf("re-upload combined log file: %w", err)
	}

	// Update DB record with new hash, sizes, and encoding
	compressedSize := int64(len(combined))
	err = c.Zed.UpdateLogFileAfterAppend(ctx, database.UpdateLogFileAfterAppendParams{
		ID:                  file.ID,
		Hash:                newHash,
		SizeBytes:           decompressedSize,
		CompressedSizeBytes: database.Int8(&compressedSize),
		ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
	})
	if err != nil {
		return fmt.Errorf("update log file record after append: %w", err)
	}

	// Trigger reparse with the larger combined file
	_, err = c.EnqueueReParseLog(ctx, group.ID, false, false, realmID)
	if err != nil {
		return fmt.Errorf("enqueue reparse after append: %w", err)
	}

	return nil
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

	return &chroniclesdk.WoWLogGroupState{
		WoWLogGroup: db2sdk.WoWLogGroupRow(group),
		Status:      jobStatus,
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

func (c *Chronicle) DeleteWoWLogInstance(ctx context.Context, logID, instanceID uuid.UUID) error {
	_, err := c.Zed.DeleteLogInstanceByIDAndGroup(ctx, database.DeleteLogInstanceByIDAndGroupParams{
		ID:         instanceID,
		LogGroupID: logID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sql.ErrNoRows
		}
		return fmt.Errorf("delete log instance: %w", err)
	}

	err = c.Zed.PruneParsedInstanceFromLogOutput(ctx, database.PruneParsedInstanceFromLogOutputParams{
		InstanceID: instanceID.String(),
		LogGroupID: logID.String(),
	})
	if err != nil {
		return fmt.Errorf("prune deleted instance from output: %w", err)
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
