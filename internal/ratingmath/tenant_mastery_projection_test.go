package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type tenantMasteryStore struct {
	*masteryFakeStore
	revision     int64
	players      []database.ListRatingMasteryPlayerKeysRow
	guilds       []database.ListRatingMasteryGuildKeysRow
	states       map[string]database.RatingMasteryAccumulator
	active       string
	playerScores []database.InsertPlayerTenantBossScoreParams
	guildScores  []database.InsertGuildTenantBossScoreParams
}

func (f *tenantMasteryStore) InTx(_ context.Context, run func(database.Store) error, _ *pgx.TxOptions) error {
	return run(f)
}
func (f *tenantMasteryStore) GetRatingConfigRevision(context.Context, uuid.UUID) (int64, error) {
	return f.revision, nil
}
func (f *tenantMasteryStore) ListRatingMasteryPlayerKeys(_ context.Context, p database.ListRatingMasteryPlayerKeysParams) ([]database.ListRatingMasteryPlayerKeysRow, error) {
	if p.BatchSize != 1 {
		panic("unbounded player enumeration")
	}
	for _, k := range f.players {
		if fmt.Sprint(k.RealmID, k.PlayerGuid, k.InstanceName, k.EncounterName, k.DifficultyName, k.MaxPlayers, k.PlayerClass, k.PlayerSpec, k.PlayerSubSpec, k.PerformanceMetric) > fmt.Sprint(p.AfterRealmID, p.AfterPlayerGuid, p.AfterInstanceName, p.AfterEncounterName, p.AfterDifficultyName, p.AfterMaxPlayers, p.AfterPlayerClass, p.AfterPlayerSpec, p.AfterPlayerSubSpec, p.AfterPerformanceMetric) {
			return []database.ListRatingMasteryPlayerKeysRow{k}, nil
		}
	}
	return nil, nil
}
func (f *tenantMasteryStore) ListRatingMasteryGuildKeys(_ context.Context, p database.ListRatingMasteryGuildKeysParams) ([]database.ListRatingMasteryGuildKeysRow, error) {
	if p.BatchSize != 1 {
		panic("unbounded guild enumeration")
	}
	for _, k := range f.guilds {
		if fmt.Sprint(k.RealmID, k.GuildID.UUID, k.InstanceName, k.EncounterName, k.DifficultyName, k.MaxPlayers) > fmt.Sprint(p.AfterRealmID, p.AfterGuildID, p.AfterInstanceName, p.AfterEncounterName, p.AfterDifficultyName, p.AfterMaxPlayers) {
			return []database.ListRatingMasteryGuildKeysRow{k}, nil
		}
	}
	return nil, nil
}
func (f *tenantMasteryStore) InitRatingMasteryAccumulator(_ context.Context, p database.InitRatingMasteryAccumulatorParams) error {
	id := fmt.Sprint(p.SubjectKind, p.RealmID, p.SubjectID, p.InstanceName, p.EncounterName, p.WindowKind)
	if f.states == nil {
		f.states = make(map[string]database.RatingMasteryAccumulator)
	}
	f.active = id
	f.state = f.states[id]
	if f.state.Pass == "" {
		f.state.Pass = "count"
	}
	return nil
}
func (f *tenantMasteryStore) AdvanceRatingMasteryAccumulator(ctx context.Context, p database.AdvanceRatingMasteryAccumulatorParams) (int64, error) {
	n, err := f.masteryFakeStore.AdvanceRatingMasteryAccumulator(ctx, p)
	if n == 1 {
		f.states[f.active] = f.state
	}
	return n, err
}
func (f *tenantMasteryStore) ListRatingMasteryPlayerPage(_ context.Context, p database.ListRatingMasteryPlayerPageParams) ([]database.ListRatingMasteryPlayerPageRow, error) {
	if p.BatchSize > 200 {
		panic("unbounded observations")
	}
	var rows []database.ListRatingMasteryPlayerPageRow
	for _, row := range f.player {
		if row.KilledAt.Time.Before(p.WindowStart.Time) || !row.KilledAt.Time.Before(p.AsOf.Time) {
			continue
		}
		if !p.FirstPage && row.LockedParse.Float64 <= p.AfterScore {
			continue
		}
		rows = append(rows, row)
	}
	return rows, nil
}
func (f *tenantMasteryStore) ListRatingMasteryGuildPage(_ context.Context, p database.ListRatingMasteryGuildPageParams) ([]database.ListRatingMasteryGuildPageRow, error) {
	if p.BatchSize > 200 {
		panic("unbounded observations")
	}
	var rows []database.ListRatingMasteryGuildPageRow
	for _, row := range f.guild {
		if row.KilledAt.Time.Before(p.WindowStart.Time) || !row.KilledAt.Time.Before(p.AsOf.Time) {
			continue
		}
		if !p.FirstPage && row.LockedParse.Float64 <= p.AfterScore {
			continue
		}
		rows = append(rows, row)
	}
	return rows, nil
}
func (f *tenantMasteryStore) InsertPlayerTenantBossScore(_ context.Context, p database.InsertPlayerTenantBossScoreParams) (int64, error) {
	f.playerScores = append(f.playerScores, p)
	return 1, nil
}
func (f *tenantMasteryStore) InsertGuildTenantBossScore(_ context.Context, p database.InsertGuildTenantBossScoreParams) (int64, error) {
	f.guildScores = append(f.guildScores, p)
	return 1, nil
}

func TestTenantMasteryStageRejectsGroupCheckpoint(t *testing.T) {
	t.Parallel()
	tenant, generation := uuid.New(), uuid.New()
	groupManifest, err := json.Marshal(projectionManifest{Policies: []database.RatingGroupPolicy{{GroupID: uuid.New()}}})
	require.NoError(t, err)
	f := &tenantMasteryStore{masteryFakeStore: &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{
		GenerationID: generation, TenantID: tenant, Phase: "mastery_pending", Cursor: []byte(`{}`),
		Manifest: groupManifest, ConfigRevision: 3,
	}}, revision: 3}
	err = TenantMasteryStageStep(t.Context(), f, tenant, generation)
	require.ErrorContains(t, err, "requires a frozen fixed-rules checkpoint")
	require.Equal(t, "mastery_pending", f.checkpoint.Phase)
	require.Empty(t, f.playerScores)
	require.Empty(t, f.guildScores)
}

func TestTenantMasteryStageRejectsStaleRevision(t *testing.T) {
	t.Parallel()
	f := &tenantMasteryStore{masteryFakeStore: &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{
		GenerationID: uuid.New(), TenantID: uuid.New(), Phase: "mastery_pending", Cursor: []byte(`{}`), ConfigRevision: 3,
	}}, revision: 4}
	err := TenantMasteryStageStep(t.Context(), f, f.checkpoint.TenantID, f.checkpoint.GenerationID)
	require.ErrorIs(t, err, ErrRatingConfigStale)
	require.Equal(t, "mastery_pending", f.checkpoint.Phase)
	require.Empty(t, f.playerScores)
	require.Empty(t, f.guildScores)
}
