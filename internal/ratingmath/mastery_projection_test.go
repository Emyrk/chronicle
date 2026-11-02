package ratingmath

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type masteryProjectionStore struct {
	*masteryFakeStore
	revision     int64
	key          database.ListRatingMasteryPlayerKeysRow
	playerScores []database.InsertRatingBossScoreParams
}

func (f *masteryProjectionStore) InTx(_ context.Context, run func(database.Store) error, _ *pgx.TxOptions) error {
	return run(f)
}
func (f *masteryProjectionStore) GetRatingConfigRevision(context.Context, uuid.UUID) (int64, error) {
	return f.revision, nil
}
func (f *masteryProjectionStore) ListRatingMasteryPlayerKeys(_ context.Context, p database.ListRatingMasteryPlayerKeysParams) ([]database.ListRatingMasteryPlayerKeysRow, error) {
	if p.BatchSize != 1 {
		panic("unbounded subject enumeration")
	}
	if p.AfterPlayerGuid != "" {
		return nil, nil
	}
	return []database.ListRatingMasteryPlayerKeysRow{f.key}, nil
}
func (f *masteryProjectionStore) ListRatingMasteryGuildKeys(_ context.Context, p database.ListRatingMasteryGuildKeysParams) ([]database.ListRatingMasteryGuildKeysRow, error) {
	if p.BatchSize != 1 {
		panic("unbounded subject enumeration")
	}
	return nil, nil
}
func (f *masteryProjectionStore) InsertRatingBossScore(_ context.Context, row database.InsertRatingBossScoreParams) error {
	f.playerScores = append(f.playerScores, row)
	return nil
}

func TestMasteryStageStepWindowsAndTransition(t *testing.T) {
	t.Parallel()
	realm, group, tenant, generation := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	manifest, err := json.Marshal(projectionManifest{
		Memberships: []database.RatingRealmGroupMembership{{RealmID: realm, GroupID: group}},
		Policies:    []database.RatingGroupPolicy{{GroupID: group, PeriodDays: 30, HalfLifeDays: 7, FullRankKills: 5, RankOneWeight: .5, BestWeight: .5, FormWeight: .3, FloorWeight: .2}},
		Bosses:      []database.RatingGroupBossPolicy{{GroupID: group, InstanceName: "Raid", EncounterName: "Boss"}},
	})
	require.NoError(t, err)
	f := &masteryProjectionStore{masteryFakeStore: &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{
		GenerationID: generation, TenantID: tenant, Phase: "mastery_pending", Cursor: []byte(`{}`), Manifest: manifest,
		ConfigRevision: 4, AsOf: database.Timestamptz(asOf),
	}, player: []database.ListRatingMasteryPlayerPageRow{{LockedParse: pgtype.Float8{Float64: 90, Valid: true}, KilledAt: database.Timestamptz(asOf.Add(-time.Hour)), RunID: uuid.New()}}},
		revision: 4, key: database.ListRatingMasteryPlayerKeysRow{RealmID: realm, PlayerGuid: "player", InstanceName: "Raid", EncounterName: "Boss", PerformanceMetric: "dps"}}
	// Use the fake's own transaction behavior while dispatching SQL methods on
	// this wrapper. Its InTx method otherwise passes the embedded fake to writes.
	for i := 0; i < 10; i++ {
		// The fake needs an independent accumulator for the second window.
		if i == 4 {
			f.state = database.RatingMasteryAccumulator{}
		}
		err = MasteryStageStep(t.Context(), f, tenant, generation)
		require.NoError(t, err)
	}
	require.Equal(t, "player_scopes", f.checkpoint.Phase)
	require.Len(t, f.playerScores, 4)
	for _, score := range f.playerScores {
		require.Equal(t, int32(1), score.EligibleKills)
	}
}

func TestMasteryStageStepRejectsStaleRevisionBeforeEnumerating(t *testing.T) {
	t.Parallel()
	f := &masteryProjectionStore{masteryFakeStore: &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{
		GenerationID: uuid.New(), TenantID: uuid.New(), Phase: "mastery_pending", Cursor: []byte(`{}`), ConfigRevision: 2,
	}}, revision: 3}
	err := MasteryStageStep(t.Context(), f, f.checkpoint.TenantID, f.checkpoint.GenerationID)
	require.ErrorIs(t, err, ErrRatingConfigStale)
	require.Equal(t, "mastery_pending", f.checkpoint.Phase)
	require.Empty(t, f.playerScores)
}
