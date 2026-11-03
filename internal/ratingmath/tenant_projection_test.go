package ratingmath

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

var tenantRenownRealmA = uuid.MustParse("00000000-0000-0000-0000-000000000001")
var tenantRenownRealmB = uuid.MustParse("00000000-0000-0000-0000-000000000002")

type tenantProjectionFake struct {
	database.Store
	checkpoint database.RatingRebuildCheckpoint
	revision   int64
	player     []database.InsertPlayerTenantBossScoreParams
	guild      []database.InsertGuildTenantBossScoreParams
}

func (f *tenantProjectionFake) InTx(_ context.Context, run func(database.Store) error, _ *pgx.TxOptions) error {
	return run(f)
}
func (f *tenantProjectionFake) GetBuildingTenantProjectionCheckpoint(_ context.Context, _ database.GetBuildingTenantProjectionCheckpointParams) (database.RatingRebuildCheckpoint, error) {
	return f.checkpoint, nil
}
func (f *tenantProjectionFake) GetRatingConfigRevision(context.Context, uuid.UUID) (int64, error) {
	return f.revision, nil
}
func (f *tenantProjectionFake) AdvanceRatingRebuildCheckpoint(_ context.Context, p database.AdvanceRatingRebuildCheckpointParams) (int64, error) {
	if p.ExpectedPhase != f.checkpoint.Phase || string(p.ExpectedCursor) != string(f.checkpoint.Cursor) {
		return 0, nil
	}
	f.checkpoint.Phase, f.checkpoint.Cursor = p.NextPhase, p.NextCursor
	return 1, nil
}
func (f *tenantProjectionFake) ListRatingStagePlayerKeys(_ context.Context, p database.ListRatingStagePlayerKeysParams) ([]database.ListRatingStagePlayerKeysRow, error) {
	if p.BatchSize != projectionPageSize {
		panic("unbounded player page")
	}
	if p.AfterPlayerGuid != "" {
		return nil, nil
	}
	return []database.ListRatingStagePlayerKeysRow{{RealmID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), PlayerGuid: "player", InstanceName: "Raid", EncounterName: "Unconfigured boss", DifficultyName: "Heroic", MaxPlayers: 20, PlayerClass: "WARRIOR", PlayerSpec: "Fury", PerformanceMetric: "dps"}}, nil
}
func (f *tenantProjectionFake) ListRatingStageGuildKeys(_ context.Context, p database.ListRatingStageGuildKeysParams) ([]database.ListRatingStageGuildKeysRow, error) {
	if p.BatchSize != projectionPageSize {
		panic("unbounded guild page")
	}
	if p.AfterGuildID != uuid.Nil {
		return nil, nil
	}
	return []database.ListRatingStageGuildKeysRow{{RealmID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), GuildID: uuid.NullUUID{UUID: uuid.MustParse("00000000-0000-0000-0000-000000000010"), Valid: true}, InstanceName: "Raid", EncounterName: "Unconfigured boss", DifficultyName: "Heroic", MaxPlayers: 20}}, nil
}
func (f *tenantProjectionFake) RatingStagePlayerPeak(_ context.Context, p database.RatingStagePlayerPeakParams) (database.RatingStagePlayerPeakRow, error) {
	return database.RatingStagePlayerPeakRow{CareerRaw: 80, PeriodRaw: 70, CareerDurationSecs: 95, PeriodDurationSecs: 120}, nil
}
func (f *tenantProjectionFake) RatingProjectionPlayerRankOne(_ context.Context, p database.RatingProjectionPlayerRankOneParams) (database.RatingProjectionPlayerRankOneRow, error) {
	return database.RatingProjectionPlayerRankOneRow{CareerRaw: 100, PeriodRaw: 100}, nil
}
func (f *tenantProjectionFake) RatingStageGuildPeak(_ context.Context, p database.RatingStageGuildPeakParams) (database.RatingStageGuildPeakRow, error) {
	return database.RatingStageGuildPeakRow{CareerRaw: 100, PeriodRaw: 110}, nil
}
func (f *tenantProjectionFake) RatingProjectionGuildRankOne(_ context.Context, p database.RatingProjectionGuildRankOneParams) (database.RatingProjectionGuildRankOneRow, error) {
	return database.RatingProjectionGuildRankOneRow{CareerRaw: 80, PeriodRaw: 90}, nil
}
func (f *tenantProjectionFake) InsertPlayerTenantBossScore(_ context.Context, p database.InsertPlayerTenantBossScoreParams) (int64, error) {
	f.player = append(f.player, p)
	return 1, nil
}
func (f *tenantProjectionFake) InsertGuildTenantBossScore(_ context.Context, p database.InsertGuildTenantBossScoreParams) (int64, error) {
	f.guild = append(f.guild, p)
	return 1, nil
}
func (f *tenantProjectionFake) ListRatingStagePlayerRenownKeys(_ context.Context, p database.ListRatingStagePlayerRenownKeysParams) ([]database.ListRatingStagePlayerRenownKeysRow, error) {
	if p.BatchSize != projectionPageSize {
		panic("unbounded player renown page")
	}
	if p.AfterEncounterName != "" {
		return nil, nil
	}
	return []database.ListRatingStagePlayerRenownKeysRow{{RealmID: tenantRenownRealmA, PlayerGuid: "player", InstanceName: "Zul'Gurub", EncounterName: "Gri'lek"}, {RealmID: tenantRenownRealmB, PlayerGuid: "player", InstanceName: "Zul'Gurub", EncounterName: "Gri'lek"}, {RealmID: tenantRenownRealmA, PlayerGuid: "player", InstanceName: "Zul'Gurub", EncounterName: "Unknown"}}, nil
}
func (f *tenantProjectionFake) ListRatingStageGuildRenownKeys(_ context.Context, p database.ListRatingStageGuildRenownKeysParams) ([]database.ListRatingStageGuildRenownKeysRow, error) {
	if p.BatchSize != projectionPageSize {
		panic("unbounded guild renown page")
	}
	if p.AfterEncounterName != "" {
		return nil, nil
	}
	return []database.ListRatingStageGuildRenownKeysRow{{RealmID: tenantRenownRealmA, GuildID: uuid.New(), InstanceName: "Zul'Gurub", EncounterName: "Gri'lek"}}, nil
}
func (f *tenantProjectionFake) RatingStagePlayerRenownTotals(_ context.Context, p database.RatingStagePlayerRenownTotalsParams) (database.RatingStagePlayerRenownTotalsRow, error) {
	return database.RatingStagePlayerRenownTotalsRow{CareerKills: 2, PeriodKills: 1}, nil
}
func (f *tenantProjectionFake) RatingStageGuildRenownTotals(_ context.Context, p database.RatingStageGuildRenownTotalsParams) (database.RatingStageGuildRenownTotalsRow, error) {
	return database.RatingStageGuildRenownTotalsRow{CareerKills: 1, PeriodKills: 1}, nil
}

func TestTenantProjectionPeakAndCuratedRenown(t *testing.T) {
	t.Parallel()
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	f := &tenantProjectionFake{revision: 3, checkpoint: database.RatingRebuildCheckpoint{TenantID: uuid.New(), GenerationID: uuid.New(), ConfigRevision: 3, Phase: "players", AsOf: database.Timestamptz(asOf), Cursor: []byte(`{}`), Manifest: []byte(`{"writer":"tenant","rules_version":2,"renown_bosses":[{"realm_id":"00000000-0000-0000-0000-000000000001","instance_name":"Zul'Gurub","encounter_name":"Gri'lek","renown_points":3},{"realm_id":"00000000-0000-0000-0000-000000000002","instance_name":"Zul'Gurub","encounter_name":"Gri'lek","renown_points":5}]}`)}}
	for i := 0; i < 10; i++ {
		done, err := TenantProjectionPage(t.Context(), f, f.checkpoint.TenantID, f.checkpoint.GenerationID)
		require.NoError(t, err)
		if done {
			break
		}
	}
	require.Equal(t, "mastery_pending", f.checkpoint.Phase)
	require.Len(t, f.player, 6)
	require.Len(t, f.guild, 4)
	require.Equal(t, "peak", f.player[0].RatingMetric, "Peak does not require a curated Renown boss")
	require.InDelta(t, 80, f.player[0].Score, 1e-9)
	require.InDelta(t, 70, f.player[1].Score, 1e-9)
	// Each Peak keeps its best kill's length so raid Peak can weigh bosses by it.
	require.InDelta(t, 95, f.player[0].BestDurationSecs, 1e-9)
	require.InDelta(t, 120, f.player[1].BestDurationSecs, 1e-9)
	require.Equal(t, "Heroic", f.player[0].DifficultyName)
	require.Equal(t, "Fury", f.player[0].PlayerSpec)
	require.True(t, f.player[1].WindowStart.Valid)
	require.Equal(t, asOf.AddDate(0, 0, -180), f.player[1].WindowStart.Time)
	require.False(t, f.player[0].WindowStart.Valid)
	require.InDelta(t, 80, f.guild[0].Score, 1e-9)
	require.Equal(t, "renown", f.player[2].RatingMetric)
	require.Equal(t, "Gri'lek", f.player[2].EncounterName)
	require.Equal(t, 6.0, f.player[2].Score)
	require.Equal(t, 3.0, f.player[3].Score)
	require.Equal(t, 10.0, f.player[4].Score, "same boss follows realm-specific flavor award")
	require.Equal(t, 5.0, f.player[5].Score)
	for _, row := range f.player {
		require.NotEqual(t, "Unknown", row.EncounterName, "unlisted boss has no Renown award")
	}
	require.Equal(t, 3.0, f.guild[2].Score)
	require.False(t, f.guild[2].WindowStart.Valid)
}

func TestTenantProjectionRejectsStaleRevision(t *testing.T) {
	t.Parallel()
	f := &tenantProjectionFake{revision: 4, checkpoint: database.RatingRebuildCheckpoint{TenantID: uuid.New(), GenerationID: uuid.New(), ConfigRevision: 3, Phase: "players", Cursor: []byte(`{}`), Manifest: []byte(`{"writer":"tenant","rules_version":2}`)}}
	_, err := TenantProjectionPage(t.Context(), f, f.checkpoint.TenantID, f.checkpoint.GenerationID)
	require.ErrorIs(t, err, ErrRatingConfigStale)
	require.Empty(t, f.player)
	require.Equal(t, "players", f.checkpoint.Phase)
}
