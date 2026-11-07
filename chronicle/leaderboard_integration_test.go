package chronicle

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/authztest"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

func TestLeaderboardSourceActionsRetainRepairObligation(t *testing.T) {
	t.Parallel()
	for _, action := range []string{"delete_instance", "invalidate", "clear_invalidation", "reparse", "unlist_reparse_lock_order", "enqueue_failure"} {
		t.Run(action, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			url := dbtestutil.NewConnectionURL(t)
			cfg, ready, err := database.PoolConfig(slog.Default(), url)
			require.NoError(t, err)
			cfg.PrepareConn = func(ctx context.Context, c *pgx.Conn) (bool, error) { return true, servicetenant.PrepareConn(ctx, c) }
			cfg.AfterRelease = func(c *pgx.Conn) bool { servicetenant.ResetConn(c); return true }
			ready()
			pool, err := pgxpool.NewWithConfig(ctx, cfg)
			require.NoError(t, err)
			defer pool.Close()
			store := database.New(pool)
			admin := servicetenant.AdminBypass(ctx)
			owner, realm := insertVisibilityTestOwnerAndRealm(t, admin, store)
			group := insertVisibilityTestLogGroup(t, admin, store, owner)
			instance := insertVisibilityTestInstance(t, admin, store, group, realm, "Molten Core", time.Now())
			tenant := uuid.New()
			_, err = pool.Exec(admin, `INSERT INTO tenants(id,name) VALUES($1,'Action tenant')`, tenant)
			require.NoError(t, err)
			_, err = pool.Exec(admin, `UPDATE wow_servers SET tenant_id=$1 WHERE id=(SELECT server_id FROM wow_server_realms WHERE id=$2)`, tenant, realm)
			require.NoError(t, err)
			encounter := uuid.New()
			_, err = store.InsertEncounter(admin, database.InsertEncounterParams{ID: encounter, InstanceID: instance, Name: "Boss", Boss: true, KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, StartTime: database.Timestamptz(time.Now().Add(-time.Minute)), EndTime: database.Timestamptz(time.Now())})
			require.NoError(t, err)
			require.NoError(t, store.InsertEncounterDpsRanking(admin, database.InsertEncounterDpsRankingParams{InstanceID: instance, EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, InstanceName: "Molten Core", EncounterName: "Boss", RealmID: realm, RealmName: "Test Realm", DifficultyName: "Normal", MaxPlayers: 40, PlayerGuid: "Player", PlayerName: "Player", PlayerClass: "MAGE", PlayerSpec: "Frost", PlayerRole: "dps", Dps: 100, DurationSecs: 60, KilledAt: database.Timestamptz(time.Now())}))
			err = store.InTx(admin, func(tx database.Store) error {
				sources, err := tx.RankingRunSources(admin, []uuid.UUID{instance})
				if err != nil {
					return err
				}
				for _, source := range sources {
					if _, err := tx.UpsertRankingRun(admin, database.UpsertRankingRunParams(source)); err != nil {
						return err
					}
				}
				runs, err := serviceratings.PrepareDirectRunsTx(admin, tx, []uuid.UUID{instance})
				if err != nil {
					return err
				}
				return serviceratings.PublishDirectRunsTx(admin, tx, runs)
			}, nil)
			require.NoError(t, err)
			before, err := store.ListLeaderboardPlayerObservations(admin, tenant)
			require.NoError(t, err)
			require.NotEmpty(t, before)
			client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
			require.NoError(t, err)
			c := &Chronicle{Zed: authz.NewDatabaseOnly(slog.Default(), store), queue: &riverqueue.Queues{Client: client}}
			if action == "delete_instance" || action == "enqueue_failure" {
				address, key := authztest.NewSpiceDBWithAddress(t)
				zed, err := authz.New(admin, authz.Options{GRPCURL: address, PreSharedKey: key, Logger: slog.Default(), DB: store})
				require.NoError(t, err)
				c.Zed = zed
			}

			switch action {
			case "enqueue_failure":
				ddl, err := pool.Acquire(admin)
				require.NoError(t, err)
				_, err = ddl.Exec(admin, "RESET ROLE; ALTER TABLE river_job ADD CONSTRAINT reject_canonical_test CHECK (kind <> 'refresh-ranking-runs'); SET ROLE chronicle")
				ddl.Release()
				require.NoError(t, err)
				err = c.InvalidateWoWLogGroup(ctx, group, "must rollback")
				require.Error(t, err)
				var invalidated bool
				require.NoError(t, pool.QueryRow(admin, "SELECT invalidated_at IS NOT NULL FROM log_instances WHERE id=$1", instance).Scan(&invalidated))
				require.False(t, invalidated)
				pending, err := store.ListLeaderboardDirtyRuns(admin, tenant)
				require.NoError(t, err)
				require.Empty(t, pending)
				after, err := store.ListLeaderboardPlayerObservations(admin, tenant)
				require.NoError(t, err)
				require.Len(t, after, len(before))
				var jobs int
				require.NoError(t, pool.QueryRow(admin, "SELECT count(*) FROM river_job WHERE kind='refresh-ranking-runs'").Scan(&jobs))
				require.Zero(t, jobs)
				return
			case "delete_instance":
				require.NoError(t, c.DeleteWoWLogInstance(ctx, group, instance)) // root request resolves tenant.
			case "invalidate":
				require.NoError(t, c.InvalidateWoWLogGroup(ctx, group, "test"))
			case "clear_invalidation":
				require.NoError(t, c.InvalidateWoWLogGroup(ctx, group, "test"))
				require.NoError(t, c.ClearWoWLogGroupInvalidation(ctx, group))
			case "unlist_reparse_lock_order":
				holder, err := pool.Begin(ctx)
				require.NoError(t, err)
				defer func() { _ = holder.Rollback(context.Background()) }()
				_, err = holder.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'")
				require.NoError(t, err)
				_, err = database.NewQueries(holder).LockWoWLogGroupParseGeneration(admin, group)
				require.NoError(t, err)
				notify := &actionNotifyStore{Store: store, pid: make(chan uint32, 1)}
				c.Zed = authz.NewDatabaseOnly(slog.Default(), notify)
				done := make(chan error, 1)
				go func() { done <- c.MarkWoWLogGroupUnlisted(ctx, group) }()
				var pid uint32
				select {
				case pid = <-notify.pid:
				case <-ctx.Done():
					t.Fatal(ctx.Err())
				}
				joined := false
				defer func() {
					_ = holder.Rollback(context.Background())
					if !joined {
						require.NoError(t, <-done)
					}
				}()
				require.Eventually(t, func() bool {
					var blocked bool
					err := pool.QueryRow(admin, "SELECT cardinality(pg_blocking_pids($1))>0", pid).Scan(&blocked)
					return err == nil && blocked
				}, 10*time.Second, 10*time.Millisecond)
				// The action is demonstrably waiting on our group row. It must NOT own
				// D1 yet: this enqueue must finish while we still hold the group row.
				_, err = holder.Exec(ctx, "SET LOCAL lock_timeout='1s'")
				require.NoError(t, err)
				require.NoError(t, database.NewQueries(holder).EnqueueLeaderboardRun(admin, database.EnqueueLeaderboardRunParams{TenantID: tenant, RunID: instance, ProcessAfter: database.Timestamptz(time.Now())}))
				require.NoError(t, holder.Commit(ctx))
				actionErr := <-done
				joined = true
				require.NoError(t, actionErr)
			case "reparse":
				tenantCtx := servicetenant.WithTenantID(ctx, tenant)
				require.NoError(t, store.InTx(tenantCtx, func(tx database.Store) error {
					_, err := advanceParseGeneration(tenantCtx, tx, group, true)
					return err
				}, nil))
			}
			if action != "reparse" {
				var jobs int
				require.NoError(t, pool.QueryRow(admin, "SELECT count(*) FROM river_job WHERE kind='refresh-ranking-runs'").Scan(&jobs))
				require.Positive(t, jobs)
			}
			pending, err := store.ListLeaderboardDirtyRuns(admin, tenant)
			require.NoError(t, err)
			require.Len(t, pending, 1)
			evidence, err := store.ListLeaderboardPlayerObservations(admin, tenant)
			require.NoError(t, err)
			require.Len(t, evidence, len(before)) // source mutation never cascades evidence away.
			_, err = (&serviceratings.RepairWorker{Store: store}).Drain(ctx, tenant)
			require.NoError(t, err)
			evidence, err = store.ListLeaderboardPlayerObservations(admin, tenant)
			require.NoError(t, err)
			// Clearing invalidation restores eligibility, not the raw rankings
			// removed by invalidation. Their later reparse publication repopulates.
			require.Empty(t, evidence)
		})
	}
}

type actionNotifyStore struct {
	database.Store
	pid  chan uint32
	once sync.Once
}

func (s *actionNotifyStore) InTx(ctx context.Context, fn func(database.Store) error, opts *pgx.TxOptions) error {
	return s.Store.InTx(ctx, func(tx database.Store) error {
		raw, ok := database.PGXTx(tx)
		if !ok {
			return fmt.Errorf("expected transaction")
		}
		s.once.Do(func() { s.pid <- raw.Conn().PgConn().PID() })
		return fn(tx)
	}, opts)
}
