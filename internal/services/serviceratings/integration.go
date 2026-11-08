package serviceratings

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// DirectRun owns a short publication serialization row in the caller transaction.
// Keep this slice in query order (tenant,run) when locking multiple identities.
type DirectRun struct {
	TenantID, RunID uuid.UUID
	Created         bool
}

// PrepareDirectRunsTx must run BEFORE source/canonical mutation in the same
// transaction as PublishDirectRunsTx. Existing privileged canonical/action
// transactions stay privileged; explicitly qualified SQL never switches RLS
// inside a transaction. Root requests retain existing RLS visibility; tenant IDs come from source rows,
// never from an absent request tenant or a zero default.
func PrepareDirectRunsTx(ctx context.Context, tx database.StoreQueries, ids []uuid.UUID) ([]DirectRun, error) {
	keys, err := tx.LeaderboardRunKeysForIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	runs := make([]DirectRun, 0, len(keys))
	for _, key := range keys {
		if key.TenantID == uuid.Nil {
			return nil, fmt.Errorf("missing leaderboard source tenant")
		}
		tenant := key.TenantID
		if !servicetenant.IsBypass(ctx) && servicetenant.TenantIDFromContext(ctx) != uuid.Nil && servicetenant.TenantIDFromContext(ctx) != tenant {
			return nil, fmt.Errorf("leaderboard source tenant mismatch")
		}
		created, err := tx.LockLeaderboardDirectPublication(ctx, database.LockLeaderboardDirectPublicationParams{TenantID: tenant, RunID: key.RunID})
		if err != nil {
			return nil, err
		}
		runs = append(runs, DirectRun{TenantID: tenant, RunID: key.RunID, Created: created})
	}
	return runs, nil
}

func PublishDirectRunsTx(ctx context.Context, tx database.StoreQueries, runs []DirectRun) error {
	for _, run := range runs {
		if !servicetenant.IsBypass(ctx) && servicetenant.TenantIDFromContext(ctx) != uuid.Nil && servicetenant.TenantIDFromContext(ctx) != run.TenantID {
			return fmt.Errorf("leaderboard publication tenant mismatch")
		}
		rows, err := tx.ProjectLeaderboardRun(ctx, database.ProjectLeaderboardRunParams{TenantID: run.TenantID, RunID: run.RunID})
		if err != nil {
			return err
		}
		if err := publishProjectionTx(ctx, tx, run.TenantID, run.RunID, rows); err != nil {
			return err
		}
		if run.Created {
			if err := tx.RemoveLeaderboardDirectPlaceholder(ctx, database.RemoveLeaderboardDirectPlaceholderParams{TenantID: run.TenantID, RunID: run.RunID}); err != nil {
				return err
			}
		}
	}
	return nil
}

// EnqueueSourceRepairTx captures all old identities BEFORE destructive/eligibility
// changes. It leaves existing evidence untouched. The caller must roll back both
// the source mutation and this obligation on failure. No external queue hop.
func EnqueueSourceRepairTx(ctx context.Context, tx database.StoreQueries, ids []uuid.UUID) error {
	keys, err := tx.LeaderboardRunKeysForIDs(ctx, ids)
	if err != nil {
		return err
	}
	for _, key := range keys {
		if key.TenantID == uuid.Nil {
			return fmt.Errorf("missing leaderboard repair tenant")
		}
		if !servicetenant.IsBypass(ctx) && servicetenant.TenantIDFromContext(ctx) != uuid.Nil && servicetenant.TenantIDFromContext(ctx) != key.TenantID {
			return fmt.Errorf("leaderboard repair tenant mismatch")
		}
		if err := tx.EnqueueLeaderboardRun(ctx, database.EnqueueLeaderboardRunParams{TenantID: key.TenantID, RunID: key.RunID, ProcessAfter: database.Timestamptz(time.Now())}); err != nil {
			return err
		}
	}
	return nil
}

// SourceContext resolves root-domain action requests BEFORE beginning a source
// transaction. Never try to switch tenant session variables inside an open tx.
func SourceContext(ctx context.Context, db database.StoreQueries, ids []uuid.UUID) (context.Context, error) {
	if servicetenant.IsBypass(ctx) || servicetenant.TenantIDFromContext(ctx) != uuid.Nil {
		return ctx, nil
	}
	keys, err := db.LeaderboardRunKeysForIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	tenant := uuid.Nil
	for _, key := range keys {
		if key.TenantID == uuid.Nil {
			return nil, fmt.Errorf("missing source tenant")
		}
		if tenant != uuid.Nil && tenant != key.TenantID {
			return nil, fmt.Errorf("source action spans tenants without explicit administrative scope")
		}
		tenant = key.TenantID
	}
	if tenant == uuid.Nil {
		return ctx, nil
	} // No source/evidence exists; no leaderboard write.
	return servicetenant.WithTenantID(ctx, tenant), nil
}
func GroupSourceContext(ctx context.Context, db database.StoreQueries, group uuid.UUID) (context.Context, error) {
	identities, err := db.RankingRunIdentitiesByLogGroupID(ctx, group)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(identities)*2)
	for _, identity := range identities {
		ids = append(ids, identity.InstanceID, identity.RunID)
	}
	return SourceContext(ctx, db, ids)
}

// EnqueueCanonicalRefreshTx is source integration, not D1 discovery. A failed
// River insert must abort the enclosing source/evidence transaction.
func EnqueueCanonicalRefreshTx(ctx context.Context, tx database.Store, q *riverqueue.Queues, ids []uuid.UUID) error {
	args := rankingargs.NewRefreshRankingRuns(ids...)
	if len(args.AffectedIDs) == 0 {
		return nil
	}
	if q == nil || q.Client == nil {
		keys, err := tx.LeaderboardRunKeysForIDs(ctx, args.AffectedIDs)
		if err != nil {
			return err
		}
		if len(keys) == 0 {
			return nil
		} // Untenant-backed legacy fixtures/sources only.
		return fmt.Errorf("canonical refresh queue unavailable for leaderboard source")
	}
	var raw pgx.Tx
	if exposer, ok := tx.(interface{ PGXTx() (pgx.Tx, bool) }); ok {
		raw, _ = exposer.PGXTx()
	} else {
		raw, _ = database.PGXTx(tx)
	}
	if raw == nil {
		return fmt.Errorf("canonical refresh requires source transaction")
	}
	_, err := q.InsertTx(ctx, raw, args, nil)
	return err
}
