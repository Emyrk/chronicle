// Package serviceratings owns bounded D2 orchestration, not evidence production.
package serviceratings

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	BatchSize          = 100
	WorkTimeout        = 10 * time.Minute
	ClaimLease         = 15 * time.Minute // SQL claim interval is checked by integration tests.
	PublicationTimeout = 30 * time.Second
	DispatchInterval   = 30 * time.Second
	DispatchEnabled    = true // Source integration is enabled; no runtime flag or implicit backfill.
	familyCount        = 12
)

type Family int32

const (
	FamilyPlayerBossBenchmark        Family = 0
	FamilyPlayerBossSubject          Family = 1
	FamilyGuildBossBenchmark         Family = 2
	FamilyGuildBossSubject           Family = 3
	FamilyGuildClearBenchmark        Family = 4
	FamilyGuildClearSubject          Family = 5
	FamilyPlayerRenownCount          Family = 6
	FamilyGuildRenownCount           Family = 7
	FamilyVariantPlayerBossBenchmark Family = 8
	FamilyVariantPlayerBossSubject   Family = 9
	FamilyVariantGuildBossBenchmark  Family = 10
	FamilyVariantGuildBossSubject    Family = 11
)

type DrainResult struct{ Claimed, Processed, Failed int }

type Worker struct {
	Store   database.Store
	Metrics *Metrics
}

// Drain claims ONE family page (<=100 total), computes every full history without
// dirty-row locks, then publishes all results in a short independent transaction.
// It never waits to fill a batch or preclaims work behind another page's compute.
func (w *Worker) Drain(ctx context.Context, tenant uuid.UUID, family Family) (DrainResult, error) {
	if servicetenant.IsBypass(ctx) {
		return DrainResult{}, fmt.Errorf("D2 drain requires tenant-scoped context, not admin bypass")
	}
	ctx, cancel := context.WithTimeout(servicetenant.WithTenantID(ctx, tenant), WorkTimeout)
	if family >= 0 && int(family) < len(metricFamilies) {
		ctx = withMetricScope(ctx, w.Metrics, tenant, metricFamilies[family])
	}
	defer cancel()
	switch family {
	case FamilyPlayerBossBenchmark:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyPlayerBossBenchmark, error) {
				return tx.ClaimLeaderboardPlayerBossBenchmark(ctx, database.ClaimLeaderboardPlayerBossBenchmarkParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossBenchmark) ([]database.ComputeLeaderboardPlayerBossBenchmarkRow, error) {
				params := make([]database.ComputeLeaderboardPlayerBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardPlayerBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric}
				}
				return collect(tx.ComputeLeaderboardPlayerBossBenchmark(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossBenchmark, rows []database.ComputeLeaderboardPlayerBossBenchmarkRow) error {
				params := make([]database.PublishLeaderboardPlayerBossBenchmarkParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardPlayerBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric,
						BestMetric: r.BestMetric, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardPlayerBossBenchmark(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossBenchmark) error {
				params := make([]database.RetryLeaderboardPlayerBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardPlayerBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardPlayerBossBenchmark(ctx, params))
			})
	case FamilyPlayerBossSubject:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyPlayerBossSubject, error) {
				return tx.ClaimLeaderboardPlayerBossSubject(ctx, database.ClaimLeaderboardPlayerBossSubjectParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossSubject) ([]database.ComputeLeaderboardPlayerBossSubjectRow, error) {
				params := make([]database.ComputeLeaderboardPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid}
				}
				return collect(tx.ComputeLeaderboardPlayerBossSubject(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossSubject, rows []database.ComputeLeaderboardPlayerBossSubjectRow) error {
				params := make([]database.PublishLeaderboardPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid,
						ObservationCount: r.ObservationCount, RawPeak: r.RawPeak, RawForm: r.RawForm, RawFloor: r.RawFloor, PeakEncounterID: r.PeakEncounterID, PeakDurationMs: r.PeakDurationMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardPlayerBossSubject(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossSubject) error {
				params := make([]database.RetryLeaderboardPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardPlayerBossSubject(ctx, params))
			})
	case FamilyGuildBossBenchmark:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyGuildBossBenchmark, error) {
				return tx.ClaimLeaderboardGuildBossBenchmark(ctx, database.ClaimLeaderboardGuildBossBenchmarkParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildBossBenchmark) ([]database.ComputeLeaderboardGuildBossBenchmarkRow, error) {
				params := make([]database.ComputeLeaderboardGuildBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardGuildBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName}
				}
				return collect(tx.ComputeLeaderboardGuildBossBenchmark(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildBossBenchmark, rows []database.ComputeLeaderboardGuildBossBenchmarkRow) error {
				params := make([]database.PublishLeaderboardGuildBossBenchmarkParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardGuildBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName,
						BestDurationMs: r.BestDurationMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardGuildBossBenchmark(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildBossBenchmark) error {
				params := make([]database.RetryLeaderboardGuildBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardGuildBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardGuildBossBenchmark(ctx, params))
			})
	case FamilyGuildBossSubject:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyGuildBossSubject, error) {
				return tx.ClaimLeaderboardGuildBossSubject(ctx, database.ClaimLeaderboardGuildBossSubjectParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildBossSubject) ([]database.ComputeLeaderboardGuildBossSubjectRow, error) {
				params := make([]database.ComputeLeaderboardGuildBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardGuildBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, GuildID: c.GuildID}
				}
				return collect(tx.ComputeLeaderboardGuildBossSubject(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildBossSubject, rows []database.ComputeLeaderboardGuildBossSubjectRow) error {
				params := make([]database.PublishLeaderboardGuildBossSubjectParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardGuildBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, GuildID: c.GuildID,
						ObservationCount: r.ObservationCount, FastestDurationMs: r.FastestDurationMs, FormMeanInverseMs: r.FormMeanInverseMs, FloorMeanInverseMs: r.FloorMeanInverseMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardGuildBossSubject(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildBossSubject) error {
				params := make([]database.RetryLeaderboardGuildBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardGuildBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, GuildID: c.GuildID, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardGuildBossSubject(ctx, params))
			})
	case FamilyVariantPlayerBossBenchmark:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardVariantDirtyPlayerBossBenchmark, error) {
				return tx.ClaimLeaderboardVariantPlayerBossBenchmark(ctx, database.ClaimLeaderboardVariantPlayerBossBenchmarkParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyPlayerBossBenchmark) ([]database.ComputeLeaderboardVariantPlayerBossBenchmarkRow, error) {
				params := make([]database.ComputeLeaderboardVariantPlayerBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardVariantPlayerBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric}
				}
				return collect(tx.ComputeLeaderboardVariantPlayerBossBenchmark(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyPlayerBossBenchmark, rows []database.ComputeLeaderboardVariantPlayerBossBenchmarkRow) error {
				params := make([]database.PublishLeaderboardVariantPlayerBossBenchmarkParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardVariantPlayerBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric,
						BestMetric: r.BestMetric, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardVariantPlayerBossBenchmark(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyPlayerBossBenchmark) error {
				params := make([]database.RetryLeaderboardVariantPlayerBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardVariantPlayerBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardVariantPlayerBossBenchmark(ctx, params))
			})
	case FamilyVariantPlayerBossSubject:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardVariantDirtyPlayerBossSubject, error) {
				return tx.ClaimLeaderboardVariantPlayerBossSubject(ctx, database.ClaimLeaderboardVariantPlayerBossSubjectParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyPlayerBossSubject) ([]database.ComputeLeaderboardVariantPlayerBossSubjectRow, error) {
				params := make([]database.ComputeLeaderboardVariantPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardVariantPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid}
				}
				return collect(tx.ComputeLeaderboardVariantPlayerBossSubject(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyPlayerBossSubject, rows []database.ComputeLeaderboardVariantPlayerBossSubjectRow) error {
				params := make([]database.PublishLeaderboardVariantPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardVariantPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid,
						ObservationCount: r.ObservationCount, RawPeak: r.RawPeak, RawForm: r.RawForm, RawFloor: r.RawFloor, PeakEncounterID: r.PeakEncounterID, PeakDurationMs: r.PeakDurationMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardVariantPlayerBossSubject(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyPlayerBossSubject) error {
				params := make([]database.RetryLeaderboardVariantPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardVariantPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardVariantPlayerBossSubject(ctx, params))
			})
	case FamilyVariantGuildBossBenchmark:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardVariantDirtyGuildBossBenchmark, error) {
				return tx.ClaimLeaderboardVariantGuildBossBenchmark(ctx, database.ClaimLeaderboardVariantGuildBossBenchmarkParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyGuildBossBenchmark) ([]database.ComputeLeaderboardVariantGuildBossBenchmarkRow, error) {
				params := make([]database.ComputeLeaderboardVariantGuildBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardVariantGuildBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant}
				}
				return collect(tx.ComputeLeaderboardVariantGuildBossBenchmark(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyGuildBossBenchmark, rows []database.ComputeLeaderboardVariantGuildBossBenchmarkRow) error {
				params := make([]database.PublishLeaderboardVariantGuildBossBenchmarkParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardVariantGuildBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant,
						BestDurationMs: r.BestDurationMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardVariantGuildBossBenchmark(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyGuildBossBenchmark) error {
				params := make([]database.RetryLeaderboardVariantGuildBossBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardVariantGuildBossBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardVariantGuildBossBenchmark(ctx, params))
			})
	case FamilyVariantGuildBossSubject:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardVariantDirtyGuildBossSubject, error) {
				return tx.ClaimLeaderboardVariantGuildBossSubject(ctx, database.ClaimLeaderboardVariantGuildBossSubjectParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyGuildBossSubject) ([]database.ComputeLeaderboardVariantGuildBossSubjectRow, error) {
				params := make([]database.ComputeLeaderboardVariantGuildBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardVariantGuildBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, RealmID: c.RealmID, GuildID: c.GuildID}
				}
				return collect(tx.ComputeLeaderboardVariantGuildBossSubject(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyGuildBossSubject, rows []database.ComputeLeaderboardVariantGuildBossSubjectRow) error {
				params := make([]database.PublishLeaderboardVariantGuildBossSubjectParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardVariantGuildBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, RealmID: c.RealmID, GuildID: c.GuildID,
						ObservationCount: r.ObservationCount, FastestDurationMs: r.FastestDurationMs, FormMeanInverseMs: r.FormMeanInverseMs, FloorMeanInverseMs: r.FloorMeanInverseMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardVariantGuildBossSubject(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardVariantDirtyGuildBossSubject) error {
				params := make([]database.RetryLeaderboardVariantGuildBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardVariantGuildBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, EncounterVariant: c.EncounterVariant, RealmID: c.RealmID, GuildID: c.GuildID, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardVariantGuildBossSubject(ctx, params))
			})
	case FamilyGuildClearBenchmark:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyGuildClearBenchmark, error) {
				return tx.ClaimLeaderboardGuildClearBenchmark(ctx, database.ClaimLeaderboardGuildClearBenchmarkParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildClearBenchmark) ([]database.ComputeLeaderboardGuildClearBenchmarkRow, error) {
				params := make([]database.ComputeLeaderboardGuildClearBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardGuildClearBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers}
				}
				return collect(tx.ComputeLeaderboardGuildClearBenchmark(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildClearBenchmark, rows []database.ComputeLeaderboardGuildClearBenchmarkRow) error {
				params := make([]database.PublishLeaderboardGuildClearBenchmarkParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardGuildClearBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers,
						BestDurationMs: r.BestDurationMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardGuildClearBenchmark(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildClearBenchmark) error {
				params := make([]database.RetryLeaderboardGuildClearBenchmarkParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardGuildClearBenchmarkParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardGuildClearBenchmark(ctx, params))
			})
	case FamilyGuildClearSubject:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyGuildClearSubject, error) {
				return tx.ClaimLeaderboardGuildClearSubject(ctx, database.ClaimLeaderboardGuildClearSubjectParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildClearSubject) ([]database.ComputeLeaderboardGuildClearSubjectRow, error) {
				params := make([]database.ComputeLeaderboardGuildClearSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardGuildClearSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, RealmID: c.RealmID, GuildID: c.GuildID}
				}
				return collect(tx.ComputeLeaderboardGuildClearSubject(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildClearSubject, rows []database.ComputeLeaderboardGuildClearSubjectRow) error {
				params := make([]database.PublishLeaderboardGuildClearSubjectParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardGuildClearSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, RealmID: c.RealmID, GuildID: c.GuildID,
						ObservationCount: r.ObservationCount, FastestDurationMs: r.FastestDurationMs, FormMeanInverseMs: r.FormMeanInverseMs, FloorMeanInverseMs: r.FloorMeanInverseMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardGuildClearSubject(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildClearSubject) error {
				params := make([]database.RetryLeaderboardGuildClearSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardGuildClearSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, RealmID: c.RealmID, GuildID: c.GuildID, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardGuildClearSubject(ctx, params))
			})
	case FamilyPlayerRenownCount:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyPlayerRenown, error) {
				return tx.ClaimLeaderboardPlayerRenownCount(ctx, database.ClaimLeaderboardPlayerRenownCountParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerRenown) ([]database.ComputeLeaderboardPlayerRenownCountRow, error) {
				params := make([]database.ComputeLeaderboardPlayerRenownCountParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardPlayerRenownCountParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid}
				}
				return collect(tx.ComputeLeaderboardPlayerRenownCount(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerRenown, rows []database.ComputeLeaderboardPlayerRenownCountRow) error {
				params := make([]database.PublishLeaderboardPlayerRenownCountParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardPlayerRenownCountParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid,
						KillCount: r.KillCount, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardPlayerRenownCount(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerRenown) error {
				params := make([]database.RetryLeaderboardPlayerRenownCountParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardPlayerRenownCountParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardPlayerRenownCount(ctx, params))
			})
	case FamilyGuildRenownCount:
		return drainFamily(ctx, w.Store,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyGuildRenown, error) {
				return tx.ClaimLeaderboardGuildRenownCount(ctx, database.ClaimLeaderboardGuildRenownCountParams{TenantID: tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildRenown) ([]database.ComputeLeaderboardGuildRenownCountRow, error) {
				params := make([]database.ComputeLeaderboardGuildRenownCountParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardGuildRenownCountParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, GuildID: c.GuildID}
				}
				return collect(tx.ComputeLeaderboardGuildRenownCount(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildRenown, rows []database.ComputeLeaderboardGuildRenownCountRow) error {
				params := make([]database.PublishLeaderboardGuildRenownCountParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardGuildRenownCountParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, GuildID: c.GuildID,
						KillCount: r.KillCount, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(ctx, tx.PublishLeaderboardGuildRenownCount(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyGuildRenown) error {
				params := make([]database.RetryLeaderboardGuildRenownCountParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardGuildRenownCountParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, RealmID: c.RealmID, GuildID: c.GuildID, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardGuildRenownCount(ctx, params))
			})
	default:
		return DrainResult{}, fmt.Errorf("invalid leaderboard family %d", family)
	}
}

type batchOne[R any] interface {
	QueryRow(func(int, R, error))
	Close() error
}
type batchExec interface {
	Exec(func(int, error))
	Close() error
}

func collect[R any](batch batchOne[R], n int) ([]R, error) {
	rows := make([]R, n)
	var first error
	seen := 0
	batch.QueryRow(func(i int, row R, err error) {
		seen++
		if first == nil {
			first = err
		}
		if i >= 0 && i < n {
			rows[i] = row
		} else if first == nil {
			first = fmt.Errorf("invalid batch result index %d", i)
		}
	})
	closeErr := batch.Close()
	if seen != n {
		first = errors.Join(first, fmt.Errorf("expected %d batch results, got %d", n, seen))
	}
	return rows, errors.Join(first, closeErr)
}
func consume(exec batchExec) error {
	var first error
	exec.Exec(func(_ int, err error) {
		if first == nil {
			first = err
		}
	})
	return errors.Join(first, exec.Close())
}

func drainFamily[C, R any](ctx context.Context, store database.Store,
	claim func(context.Context, database.Store) ([]C, error),
	compute func(context.Context, database.Store, []C) ([]R, error),
	publish func(context.Context, database.Store, []C, []R) error,
	retry func(context.Context, database.Store, []C) error,
) (DrainResult, error) {
	var result DrainResult
	var claims []C
	err := store.InTx(ctx, func(tx database.Store) error { var err error; claims, err = claim(ctx, tx); return err }, nil)
	if err != nil {
		return result, fmt.Errorf("claim: %w", err)
	}
	result.Claimed = len(claims)
	if len(claims) == 0 {
		return result, nil
	}
	process := func(items []C) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		var rows []R
		computeStart := time.Now()
		// No queue/result writes or dirty-row locks occur during compute. Explicit
		// transaction exists only to set database-side timeouts and drain one batch.
		err := store.InTx(ctx, func(tx database.Store) error {
			if err := tx.SetLeaderboardWorkerTimeouts(ctx, "10min"); err != nil {
				return err
			}
			var err error
			rows, err = compute(ctx, tx, items)
			return err
		}, nil)
		observeMetricDuration(ctx, "compute", computeStart, err)
		if err != nil {
			return fmt.Errorf("compute: %w", err)
		}
		pubctx, cancel := context.WithTimeout(ctx, PublicationTimeout)
		defer cancel()
		outcome := &publicationOutcome{}
		pubctx = context.WithValue(pubctx, publicationOutcomeKey{}, outcome)
		publishStart := time.Now()
		err = store.InTx(pubctx, func(tx database.Store) error {
			if err := tx.SetLeaderboardWorkerTimeouts(pubctx, "30s"); err != nil {
				return err
			}
			if err := publish(pubctx, tx, items, rows); err != nil {
				return err
			}
			// Benchmark-only changes invalidate normalized career candidates too.
			// The invalidation commits with D2 output, never on a fenced result.
			if outcome.published > 0 {
				tenant := servicetenant.TenantIDFromContext(pubctx)
				if err := tx.EnqueueLeaderboardCareer(pubctx, tenant); err != nil {
					return err
				}
				return tx.BumpLeaderboardHighlightGeneration(pubctx, tenant)
			}
			return nil
		}, nil)
		observeMetricDuration(ctx, "publish", publishStart, err)
		if err == nil {
			observeMetricEvent(ctx, "publish", "committed", outcome.published)
			observeMetricEvent(ctx, "publish", "fenced", outcome.fenced)
		}
		return err
	}
	release := func(items []C) error {
		// Cleanup is bounded but survives cancellation. Token checks mean this cannot
		// release a replacement owner. Failed cleanup is safe: lease expiry recovers.
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		start := time.Now()
		err := store.InTx(cleanup, func(tx database.Store) error {
			if err := tx.SetLeaderboardWorkerTimeouts(cleanup, "5s"); err != nil {
				return err
			}
			return retry(cleanup, tx, items)
		}, nil)
		observeMetricDuration(ctx, "retry", start, err)
		if err == nil {
			observeMetricEvent(ctx, "retry", "committed_attempt", len(items))
		}
		return err
	}
	err = process(claims)
	if err == nil {
		result.Processed = len(claims)
		return result, nil
	}
	// Isolate data/constraint poison only. Network/timeouts do NOT fan out into100
	// immediate attempts. Each poison scope receives5s..5min retry_after; healthy
	// scopes in the same page can still progress within the original10min budget.
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && len(pgerr.Code) >= 2 && (pgerr.Code[:2] == "22" || pgerr.Code[:2] == "23") && ctx.Err() == nil && len(claims) > 1 {
		for i := range claims {
			if ctx.Err() != nil {
				result.Failed += len(claims) - i
				return result, errors.Join(ctx.Err(), release(claims[i:]))
			}
			if itemErr := process(claims[i : i+1]); itemErr != nil {
				result.Failed++
				if releaseErr := release(claims[i : i+1]); releaseErr != nil {
					return result, errors.Join(itemErr, releaseErr)
				}
			} else {
				result.Processed++
			}
		}
		return result, nil
	}
	result.Failed = len(claims)
	releaseErr := release(claims)
	if releaseErr != nil {
		return result, errors.Join(err, releaseErr)
	}
	if ctx.Err() != nil {
		return result, ctx.Err()
	}
	// Retry is durable in D2. Do not immediately hammer poison scopes via River.
	return result, nil
}
