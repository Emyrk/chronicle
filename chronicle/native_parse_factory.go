package chronicle

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
)

type HeadlessParseOptions struct {
	Pool           *pgxpool.Pool
	Storage        storage.ObjectStorage
	Logger         *slog.Logger
	BinaryIdentity string
	Admit          func(context.Context, string) (context.Context, context.CancelFunc, error)
}

// HeadlessParseWorker owns admission only; compute receives a cancellable
// context before it can claim a lease or touch raw objects.
type HeadlessParseWorker struct {
	river.Worker[ArgsNativeLogParse]
	identity string
	admit    func(context.Context, string) (context.Context, context.CancelFunc, error)
}

func (w *HeadlessParseWorker) Work(ctx context.Context, job *river.Job[ArgsNativeLogParse]) error {
	if job.Args.BinaryIdentity != w.identity {
		return river.JobCancel(fmt.Errorf("native job belongs to another executable"))
	}
	admitted, release, err := w.admit(ctx, job.Args.BinaryIdentity)
	if err != nil {
		return river.JobSnooze(5 * time.Second)
	}
	defer release()
	return w.Worker.Work(admitted, job)
}

// NewHeadlessParseWorker constructs plain dependencies only. Each parse gets
// fresh local caches, so no pubsub, cache reconciler, or shared WoWDB is needed.
func NewHeadlessParseWorker(o HeadlessParseOptions) (*HeadlessParseWorker, error) {
	if o.Pool == nil || o.Storage == nil || o.Logger == nil || o.Admit == nil || o.BinaryIdentity == "" {
		return nil, fmt.Errorf("headless parse dependencies required")
	}
	store := database.New(o.Pool)
	inserter, err := river.NewClient(riverpgxv5.New(o.Pool), &river.Config{Logger: o.Logger})
	if err != nil {
		return nil, fmt.Errorf("create transactional finalize inserter: %w", err)
	}
	worker, err := NewNativeParseWorker(NativeParseOptions{
		DB: store, Storage: o.Storage, Logger: o.Logger, BinaryIdentity: o.BinaryIdentity,
		ResolveDataset: ResolveNativeParseDataset,
		AcquireGameDB: func(ctx context.Context, id uuid.UUID, revision int64) (gamedb.GameDB, func(), error) {
			return acquireNativeParseGameDB(ctx, o.Pool, store, id, revision)
		},
		RegistryForFlavor: func(flavor database.WoWFlavor) *registry.Registry {
			return registry.RegistryForFlavor(o.Logger, flavor)
		},
		EnqueueFinalize: func(ctx context.Context, tx database.Store, attempt database.ParserCheckpointAttempt) error {
			pgxTx, ok := database.PGXTx(tx)
			if !ok {
				return fmt.Errorf("finalize enqueue requires pgx transaction")
			}
			_, err := inserter.InsertTx(ctx, pgxTx, ArgsFinalizeLogParse{
				ArgsLogParse: ArgsLogParse{LogID: attempt.LogGroupID, ParseGeneration: attempt.Generation, ParserEngine: chroniclesdk.ParserEngineNext, TenantID: servicetenant.TenantIDFromContext(ctx)},
				AttemptID:    attempt.AttemptID, BinaryIdentity: attempt.ProducingBinary,
			}, nil)
			return err
		},
	})
	if err != nil {
		return nil, err
	}
	return &HeadlessParseWorker{Worker: worker, identity: o.BinaryIdentity, admit: o.Admit}, nil
}

// NewWorkerNativeLogParse uses the same compute adapter in ordinary deployment;
// this process itself is the primary, so admission checks its immutable identity.
func (c *Chronicle) NewWorkerNativeLogParse(pool *pgxpool.Pool) (*HeadlessParseWorker, error) {
	identity, err := version.BinaryIdentity()
	if err != nil {
		return nil, err
	}
	return NewHeadlessParseWorker(HeadlessParseOptions{Pool: pool, Storage: c.Storage, Logger: c.logger, BinaryIdentity: identity,
		Admit: func(ctx context.Context, expected string) (context.Context, context.CancelFunc, error) {
			if expected != identity {
				return nil, nil, fmt.Errorf("native job belongs to another executable")
			}
			child, cancel := context.WithCancel(ctx)
			return child, cancel, nil
		},
	})
}

// ResolveNativeParseDataset uses only the supplied transaction and holds
// realm, server, tenant, and dataset locks until that transaction commits.
func ResolveNativeParseDataset(ctx context.Context, db database.Store, realmID uuid.UUID, lock bool) (ResolvedDataset, error) {
	if !lock {
		var resolved ResolvedDataset
		err := db.InTx(ctx, func(tx database.Store) error {
			var err error
			resolved, err = ResolveNativeParseDataset(ctx, tx, realmID, true)
			return err
		}, nil)
		return resolved, err
	}
	ctx = servicetenant.AdminBypass(ctx)
	serverID, err := db.LockRealmDatasetResolution(ctx, realmID)
	if err != nil {
		return ResolvedDataset{}, fmt.Errorf("lock parse realm resolution: %w", err)
	}
	server, err := db.LockServerDatasetResolution(ctx, serverID)
	if err != nil {
		return ResolvedDataset{}, fmt.Errorf("lock parse server resolution: %w", err)
	}
	datasetID := servicedataset.DefaultDatasetID
	var additional []string
	if server.TenantID.Valid {
		tenant, err := db.LockTenantDatasetResolution(ctx, server.TenantID.UUID)
		if err != nil {
			return ResolvedDataset{}, fmt.Errorf("lock parse tenant resolution: %w", err)
		}
		if tenant.TenantDatasetID.Valid && tenant.TenantDatasetID.UUID != uuid.Nil {
			datasetID = tenant.TenantDatasetID.UUID
		}
		additional = tenant.AdditionalFlavor
	}
	if server.ServerDatasetID.Valid && server.ServerDatasetID.UUID != uuid.Nil {
		datasetID = server.ServerDatasetID.UUID
	}
	dataset, err := db.LockDatasetForResolution(ctx, datasetID)
	if err != nil {
		return ResolvedDataset{}, fmt.Errorf("lock parse dataset resolution: %w", err)
	}
	if datasetID == uuid.Nil || dataset.Revision <= 0 {
		return ResolvedDataset{}, fmt.Errorf("invalid parse dataset identity")
	}
	return ResolvedDataset{DatasetID: datasetID, Revision: dataset.Revision, Flavor: database.FlavorFromStrings(dataset.DefaultFlavor), AdditionalFlavor: database.FlavorFromStrings(additional)}, nil
}

// Match the primary strict acquisition contract: validate the captured identity
// and allocate only fresh parse-local caches. Recheck before acquisition too;
// the producer's acceptance fence still detects mutations during lazy reads.
func acquireNativeParseGameDB(ctx context.Context, pool *pgxpool.Pool, store database.Store, id uuid.UUID, revision int64) (gamedb.GameDB, func(), error) {
	fence := datasetRevisionFence{datasetID: id, revision: revision}
	if err := fence.check(ctx, store); err != nil {
		return nil, nil, err
	}
	db, err := gamedb.New(ctx, gamedb.Options{Pool: pool, DB: store, DatasetID: id, Talents: talents.NewFetcher(store, nil, 1)})
	if err != nil {
		return nil, nil, err
	}
	return db, func() { _ = db.Close() }, nil
}
