package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
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

func TestTenantMasteryStageAllParsedBossesCrossRealmAndWindows(t *testing.T) {
	t.Parallel()
	realmA := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	realmB := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	tenant, generation, guildA, guildB := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	manifest, err := json.Marshal(struct {
		Writer string                      `json:"writer"`
		Policy database.RatingTenantPolicy `json:"tenant_policy"`
	}{Writer: "tenant", Policy: database.RatingTenantPolicy{TenantID: tenant, HalfLifeDays: 7, FullRankKills: 5, RankOneWeight: .5, BestWeight: .5, FormWeight: .3, FloorWeight: .2}})
	require.NoError(t, err)
	f := &tenantMasteryStore{masteryFakeStore: &masteryFakeStore{checkpoint: database.RatingRebuildCheckpoint{
		GenerationID: generation, TenantID: tenant, Phase: "mastery_pending", Cursor: []byte(`{}`), Manifest: manifest, ConfigRevision: 3, AsOf: database.Timestamptz(asOf),
	}}, revision: 3}
	for i, realm := range []uuid.UUID{realmA, realmB} {
		guild := guildA
		if i == 1 {
			guild = guildB
		}
		for _, boss := range []string{"Boss A", "Boss B"} {
			f.players = append(f.players, database.ListRatingMasteryPlayerKeysRow{RealmID: realm, PlayerGuid: "same-player", InstanceName: "Raid", EncounterName: boss, PerformanceMetric: "dps"})
			f.guilds = append(f.guilds, database.ListRatingMasteryGuildKeysRow{RealmID: realm, GuildID: uuid.NullUUID{UUID: guild, Valid: true}, InstanceName: "Raid", EncounterName: boss})
		}
	}
	for i, when := range []time.Time{asOf.AddDate(0, 0, -200), asOf.AddDate(0, 0, -1)} {
		score := float64(50 + i*40)
		id := uuid.New()
		f.player = append(f.player, database.ListRatingMasteryPlayerPageRow{LockedParse: pgtype.Float8{Float64: score, Valid: true}, KilledAt: database.Timestamptz(when), RunID: id})
		f.guild = append(f.guild, database.ListRatingMasteryGuildPageRow{LockedParse: pgtype.Float8{Float64: score, Valid: true}, KilledAt: database.Timestamptz(when), RunID: id})
	}
	for i := 0; i < 100 && f.checkpoint.Phase == "mastery_pending"; i++ {
		require.NoError(t, TenantMasteryStageStep(t.Context(), f, tenant, generation))
	}
	require.Equal(t, "player_scopes", f.checkpoint.Phase)
	require.Len(t, f.playerScores, 16)
	require.Len(t, f.guildScores, 16)
	for _, scores := range []struct {
		kind string
		rows int
	}{{"player", len(f.playerScores)}, {"guild", len(f.guildScores)}} {
		require.Equal(t, 16, scores.rows, scores.kind)
	}
	playerKeys := map[string]bool{}
	guildKeys := map[string]bool{}
	for _, s := range f.playerScores {
		require.Equal(t, tenant, s.TenantID)
		require.Equal(t, generation, s.GenerationID)
		require.True(t, s.BestLockedParse.Valid)
		require.True(t, s.Form.Valid)
		require.True(t, s.FloorScore.Valid)
		if s.WindowKind == "period" {
			require.Equal(t, int32(1), s.EligibleKills)
			require.Equal(t, asOf.AddDate(0, 0, -180), s.WindowStart.Time)
			require.Equal(t, asOf, s.WindowEnd.Time)
		} else {
			require.Equal(t, "all_time", s.WindowKind)
			require.Equal(t, int32(2), s.EligibleKills)
			require.False(t, s.WindowStart.Valid)
			require.False(t, s.WindowEnd.Valid)
		}
		playerKeys[fmt.Sprint(s.RealmID, s.EncounterName, s.WindowKind, s.RatingMetric)] = true
	}
	for _, s := range f.guildScores {
		require.True(t, s.BestLockedParse.Valid)
		require.True(t, s.Form.Valid)
		require.True(t, s.FloorScore.Valid)
		if s.WindowKind == "period" {
			require.Equal(t, int32(1), s.EligibleKills)
			require.Equal(t, asOf.AddDate(0, 0, -180), s.WindowStart.Time)
		} else {
			require.Equal(t, int32(2), s.EligibleKills)
			require.False(t, s.WindowStart.Valid)
		}
		guildKeys[fmt.Sprint(s.RealmID, s.GuildID, s.EncounterName, s.WindowKind, s.RatingMetric)] = true
	}
	require.Len(t, playerKeys, 16)
	require.Len(t, guildKeys, 16)
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
	require.ErrorContains(t, err, "requires a frozen tenant checkpoint")
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
