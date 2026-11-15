package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
)

const KindNativeLogParse = "native-log-parse"
const QueueNativeLogParsing = "native-log-parsing"

type ArgsNativeLogParse struct {
	ArgsLogParse
	BinaryIdentity string    `json:"binary_identity"`
	RequestID      uuid.UUID `json:"request_id"`
}

func (ArgsNativeLogParse) Kind() string { return KindNativeLogParse }
func (a ArgsNativeLogParse) InsertOpts() river.InsertOpts {
	opts := a.ArgsLogParse.InsertOpts()
	opts.Queue = QueueNativeLogParsing
	return opts
}

// NativeParseOptions supplies only plain capabilities. No Chronicle, Zed, HTTP,
// authz, or publication service is constructed in the native process.
type NativeParseOptions struct {
	// LeaseTTL and RenewEvery default to two minutes and thirty seconds.
	LeaseTTL          time.Duration
	RenewEvery        time.Duration
	DB                database.Store
	Storage           storage.ObjectStorage
	Logger            *slog.Logger
	BinaryIdentity    string
	ResolveDataset    ParseDatasetResolver
	AcquireGameDB     func(context.Context, uuid.UUID, int64) (gamedb.GameDB, func(), error)
	RegistryForFlavor func(database.WoWFlavor) *registry.Registry
	EnqueueFinalize   ParseFinalizeEnqueue
}
type WorkerNativeLogParse struct {
	river.WorkerDefaults[ArgsNativeLogParse]
	options NativeParseOptions
}

func NewNativeParseWorker(o NativeParseOptions) (*WorkerNativeLogParse, error) {
	var err error
	o, err = normalizeNativeLeaseTiming(o)
	if err != nil {
		return nil, err
	}
	if o.DB == nil || o.Storage == nil || o.Logger == nil || o.ResolveDataset == nil || o.AcquireGameDB == nil || o.RegistryForFlavor == nil || o.EnqueueFinalize == nil {
		return nil, fmt.Errorf("native parser dependencies required")
	}
	actual, err := version.BinaryIdentity()
	if err != nil {
		return nil, err
	}
	if o.BinaryIdentity != actual {
		return nil, fmt.Errorf("native parser executable identity mismatch")
	}
	return &WorkerNativeLogParse{options: o}, nil
}

// FrozenNativeInput is captured in one repeatable-read transaction. Raw loading
// uses these exact parts, never a subsequent mutable ListReadyLogFileParts call.
type FrozenNativeInput struct {
	File        database.LogFile
	Parts       []database.LogFilePart
	Artifacts   []database.LogGroupArtifact
	LogicalFile CompleteFile
}

func (w *WorkerNativeLogParse) Work(ctx context.Context, job *river.Job[ArgsNativeLogParse]) error {
	o := w.options
	args := job.Args
	if args.Profile {
		return river.JobCancel(errNativeProfileUnsupported)
	}
	ctx = parseoptions.WithVerbose(ctx, args.Verbose)

	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	if args.BinaryIdentity != o.BinaryIdentity {
		return river.JobCancel(fmt.Errorf("native job belongs to another executable"))
	}
	if args.ParserEngine != chroniclesdk.ParserEngineNext {
		return river.JobCancel(fmt.Errorf("native job requires next parser"))
	}
	args.ParseGeneration = effectiveParseGeneration(args.ParseGeneration)
	handoff := NewParseHandoffStore(o.DB)
	if _, err := handoff.Ensure(ctx, args.LogID); err != nil {
		return err
	}
	token := uuid.New()
	duration := pgtype.Interval{Microseconds: o.LeaseTTL.Microseconds(), Valid: true}
	state, err := handoff.ClaimLease(ctx, database.ClaimParserHandoffLeaseParams{LogGroupID: args.LogID, Generation: args.ParseGeneration, LeaseToken: token, LeaseDuration: duration})
	if errors.Is(err, pgx.ErrNoRows) {
		return river.JobSnooze(5 * time.Second)
	}
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	done := make(chan struct{})
	stop := make(chan struct{})
	go func(ctx context.Context) {
		defer close(done)
		ticker := time.NewTicker(o.RenewEvery)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := handoff.RenewLease(ctx, database.RenewParserHandoffLeaseParams{LogGroupID: args.LogID, Generation: args.ParseGeneration, LeaseToken: token, LeaseDuration: duration}); err != nil {
					cancel(err)
					return
				}
			}
		}
	}(ctx)
	defer func() {
		close(stop)
		<-done
		releaseCtx, releaseCancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer releaseCancel()
		_, _ = handoff.ReleaseLease(releaseCtx, database.ReleaseParserHandoffLeaseParams{LogGroupID: args.LogID, Generation: args.ParseGeneration, LeaseToken: token})
	}()
	var frozen FrozenNativeInput
	var group database.WoWLogGroup
	err = o.DB.InTx(ctx, func(tx database.Store) error {
		row, err := tx.GetWoWLogGroupByID(ctx, args.LogID)
		if err != nil {
			return err
		}
		group = row.WoWLogGroup
		files, err := tx.GetWoWLogFilesByGroupID(ctx, args.LogID)
		if err != nil {
			return err
		}
		if len(files) != 1 {
			return fmt.Errorf("native parser requires one logical file")
		}
		frozen.File = files[0]
		frozen.Parts, err = tx.ListReadyLogFileParts(ctx, frozen.File.ID)
		if err != nil {
			return err
		}
		frozen.Artifacts, err = tx.ListLogGroupArtifactsForParse(ctx, args.LogID)
		return err
	}, &pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		return err
	}
	format := group.LogType.Format()
	if group.Format.Valid {
		format = group.Format.LogFormat
	}
	if err = args.ParserEngine.ValidateFormat(format); err != nil {
		return err
	}
	raw, err := loadRawLogFileWithParts(ctx, o.Storage, frozen.File, frozen.Parts)
	if err != nil {
		return err
	}
	data, err := io.ReadAll(raw)
	if err != nil {
		return err
	}
	frozen.LogicalFile = debugInput(frozen.File.ID.String(), data)
	original := database.FlavorFromStrings(group.Flavor)
	realmID := args.RealmID
	realmName := ""
	if realmID == uuid.Nil {
		scanFlavor := original
		if len(scanFlavor) == 0 && format == database.LogFormatV22Cleu {
			scanFlavor = database.WoWFlavor{database.FlavorWoWForever}
		}
		realmName = scanRealmName(format, scanFlavor, data)
		if realmName == "" {
			return fmt.Errorf("no realm info in frozen prefix")
		}
		r, err := lookupPreParseRealm(ctx, o.DB, realmName)
		if err != nil {
			return err
		}
		realmID = r.ID
		realmName = r.Name
	}
	var resolved ResolvedDataset
	err = o.DB.InTx(ctx, func(tx database.Store) error {
		var err error
		resolved, err = o.ResolveDataset(ctx, tx, realmID, true)
		return err
	}, nil)
	if err != nil {
		return err
	}
	flavor, _ := resolveLogFlavor(original, len(original) > 0, resolved)
	identity := snapshot.Compatibility{DatasetID: resolved.DatasetID.String(), DatasetRevision: resolved.Revision, BuildIdentity: o.BinaryIdentity, Format: string(format), Flavor: flavor.CanonicalKey()}
	if err = identity.Validate(); err != nil {
		return err
	}
	db, closeDB, err := o.AcquireGameDB(ctx, resolved.DatasetID, resolved.Revision)
	if err != nil {
		return err
	}
	defer closeDB()
	talents, err := db.TalentTrees(ctx, resolved.DatasetID)
	if err != nil {
		return err
	}
	ctx = snapshot.WithCompatibility(ctx, identity)
	ctx = parsectx.With(ctx, parsectx.Context{Type: group.LogType, Format: format, Flavor: flavor, DatasetID: resolved.DatasetID, TalentTrees: talents})
	recorder := &nativeSpellRecorder{GameDB: db, ids: make(map[chrondbc.SpellID]bool)}
	compute := &parseCompute{logger: o.Logger, storage: o.Storage, parserEngine: args.ParserEngine}
	// Arbitrary appends replay the entire frozen prefix. They are not declared
	// complete-file boundaries and cannot resume a previous COMPLETE session.
	parsed, err := compute.parseDebugSession(ctx, format, []database.LogFile{frozen.File}, frozen.Artifacts, recorder, o.RegistryForFlavor(flavor), data, realmName)
	if err != nil {
		return err
	}
	var saved bytes.Buffer
	if err = parsed.snapshot(&saved); err != nil {
		return err
	}
	r := parsed.report
	env := NativeCheckpointEnvelope{Version: 1, Boundary: "COMPLETE/preFinalize", Args: args.ArgsLogParse, RealmID: realmID, RealmName: realmName, Identity: identity, Snapshot: saved.Bytes(), LogCapabilities: parsed.logCapabilities, Report: NativeParseReport{r.loadFileDuration, r.parseDuration, r.totalLines, r.consumerTimes, r.missedSpells}}
	for id := range recorder.ids {
		env.SpellIDs = append(env.SpellIDs, id)
	}
	slices.Sort(env.SpellIDs)
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	if err = json.NewEncoder(gz).Encode(env); err != nil {
		_ = gz.Close()
		return err
	}
	if err = gz.Close(); err != nil {
		return err
	}
	attemptID := uuid.New()
	key := fmt.Sprintf("native-checkpoints/%s/%d/%s.json.gz", args.LogID, args.ParseGeneration, attemptID)
	if _, err = o.Storage.UploadFile(ctx, BucketRaidLogs, key, bytes.NewReader(compressed.Bytes())); err != nil {
		return err
	}
	digest := sha256.Sum256(compressed.Bytes())
	identityJSON, _ := json.Marshal(identity)
	inputJSON, err := json.Marshal(frozen)
	if err != nil {
		return err
	}
	// Acceptance validates live lease, generation and predecessor and enqueues in
	// the same transaction. Retain uploaded bytes even on an uncertain commit.
	// Unaccepted upload orphans require a separate age-bounded reconciliation
	// policy; do not delete here because acceptance may already have committed.
	_, err = handoff.Accept(ctx, database.InsertParserCheckpointAttemptParams{AttemptID: attemptID, ProducingBinary: o.BinaryIdentity, DatasetIdentity: identityJSON, InputIdentity: inputJSON, ParserEngine: string(args.ParserEngine), ObjectKey: key, ObjectDigest: hex.EncodeToString(digest[:]), LogGroupID: args.LogID, Generation: args.ParseGeneration, LeaseToken: token, PredecessorIteration: state.HeadIteration, PredecessorAttemptID: state.HeadAttemptID}, func(ctx context.Context, tx database.Store, attempt database.ParserCheckpointAttempt) error {
		current, err := o.ResolveDataset(ctx, tx, realmID, true)
		if err != nil {
			return err
		}
		f, _ := resolveLogFlavor(original, len(original) > 0, current)
		if current.DatasetID != resolved.DatasetID || current.Revision != resolved.Revision || f.CanonicalKey() != identity.Flavor {
			return ErrParseIdentityChanged
		}
		return o.EnqueueFinalize(ctx, tx, attempt)
	})
	return err
}

func normalizeNativeLeaseTiming(o NativeParseOptions) (NativeParseOptions, error) {
	if o.LeaseTTL == 0 {
		o.LeaseTTL = 2 * time.Minute
	}
	if o.RenewEvery == 0 {
		o.RenewEvery = 30 * time.Second
	}
	if o.LeaseTTL < time.Microsecond || o.RenewEvery <= 0 || o.RenewEvery >= o.LeaseTTL {
		return o, fmt.Errorf("native lease timing requires TTL >= 1us and 0 < renewal interval < TTL")
	}
	return o, nil
}
