package servicerankings

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type variantParseStore struct {
	database.Store
	calls    []database.GetParseVariantMembershipCohortParams
	saved    []database.ParseVariantResult
	inserted []database.InsertParseVariantResultParams
	cohort   []float64
}

func (s *variantParseStore) GetParseVariantMembershipCohort(_ context.Context, p database.GetParseVariantMembershipCohortParams) ([]float64, error) {
	s.calls = append(s.calls, p)
	if s.cohort != nil {
		return s.cohort, nil
	}
	values := make([]float64, 30)
	for i := range values {
		values[i] = 10 + float64(i)
		if p.EncounterVariant == "hard" {
			values[i] += 1000
		}
	}
	return values, nil
}
func (s *variantParseStore) ListParseVariantResultsForInstance(context.Context, database.ListParseVariantResultsForInstanceParams) ([]database.ParseVariantResult, error) {
	return s.saved, nil
}

func TestIndividualParseEncounterVariantIsolation(t *testing.T) {
	t.Parallel()
	for _, metric := range []parsepolicy.Metric{parsepolicy.MetricDPS, parsepolicy.MetricHPS} {
		t.Run(string(metric), func(t *testing.T) {
			t.Parallel()
			store := &variantParseStore{}
			rankings := []database.ListRankingsForInstanceRow{}
			players := []chroniclesdk.InstanceParsePlayer{}
			for _, variant := range []string{"normal", "hard", ""} {
				rankings = append(rankings, database.ListRankingsForInstanceRow{PlayerGuid: variant, EncounterName: "Hodir", DifficultyName: "heroic", MaxPlayers: 25, EncounterVariant: pgtype.Text{String: variant, Valid: variant != ""}, PlayerClass: "Warrior", PlayerSpec: "Fury", Dps: 100, Hps: 100})
				players = append(players, chroniclesdk.InstanceParsePlayer{PlayerGUID: variant, Bosses: []chroniclesdk.InstanceParseBoss{{EncounterName: "Hodir", DifficultyName: "heroic", MaxPlayers: 25, MetricValue: 100, PreciseScore: 42, DisplayScore: 42, Status: "ok"}}})
			}
			cutoff := database.Timestamptz(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
			require.NoError(t, applyVariantParses(t.Context(), store, uuid.Nil, uuid.New(), rankings, players, []string{"Hodir"}, metric, parsepolicy.CohortModeSpec, cutoff, pgtype.Timestamptz{}, false))
			require.Len(t, store.calls, 2)
			for _, call := range store.calls {
				require.Equal(t, string(metric), call.Metric)
				require.Equal(t, "heroic", call.DifficultyName)
				require.Equal(t, int16(25), call.MaxPlayers)
			}
			require.Greater(t, players[0].Bosses[0].PreciseScore, players[1].Bosses[0].PreciseScore)
			require.Equal(t, "normal", *players[0].Bosses[0].EncounterVariant)
			require.Equal(t, "hard", *players[1].Bosses[0].EncounterVariant)
			require.Nil(t, players[2].Bosses[0].EncounterVariant)
			require.Equal(t, 42.0, players[2].Bosses[0].PreciseScore, "unknown retains Combined")
			require.Equal(t, players[0].Bosses[0].PreciseScore, players[0].AverageParse.PreciseScore)
		})
	}
}

func TestVariantCohortCacheIncludesMetricDifficultyAndSize(t *testing.T) {
	t.Parallel()
	cache := make(variantCohortCache)
	store := &variantParseStore{}
	p := database.GetParseVariantMembershipCohortParams{EncounterVariant: "normal", Metric: "dps", MaxPlayers: 10}
	_, err := cache.score(t.Context(), store, p, 100)
	require.NoError(t, err)
	_, err = cache.score(t.Context(), store, p, 200)
	require.NoError(t, err)
	require.Len(t, store.calls, 1)
	p.Metric = "hps"
	_, err = cache.score(t.Context(), store, p, 100)
	require.NoError(t, err)
	p.DifficultyName = "heroic"
	_, err = cache.score(t.Context(), store, p, 100)
	require.NoError(t, err)
	p.MaxPlayers = 25
	_, err = cache.score(t.Context(), store, p, 100)
	require.NoError(t, err)
	p.EncounterVariant = "hard"
	_, err = cache.score(t.Context(), store, p, 100)
	require.NoError(t, err)
	require.Len(t, store.calls, 5)
}

func TestHistoricalVariantParseUsesPersistedProjection(t *testing.T) {
	t.Parallel()
	for _, metric := range []parsepolicy.Metric{parsepolicy.MetricDPS, parsepolicy.MetricHPS} {
		t.Run(string(metric), func(t *testing.T) {
			t.Parallel()
			store := &variantParseStore{saved: []database.ParseVariantResult{{PlayerGuid: "player", EncounterName: "Hodir", MaxPlayers: 10, EncounterVariant: "hard", PreciseScore: 73, DisplayScore: 73, Status: "ok"}}}
			rankings := []database.ListRankingsForInstanceRow{{PlayerGuid: "player", EncounterName: "Hodir", MaxPlayers: 10, EncounterVariant: pgtype.Text{String: "hard", Valid: true}, PlayerSpec: "Fury"}}
			players := []chroniclesdk.InstanceParsePlayer{{PlayerGUID: "player", Bosses: []chroniclesdk.InstanceParseBoss{{EncounterName: "Hodir", MaxPlayers: 10, MetricValue: 100, PreciseScore: 42, Status: "ok"}}}}
			require.NoError(t, applyVariantParses(t.Context(), store, uuid.Nil, uuid.New(), rankings, players, []string{"Hodir"}, metric, parsepolicy.CohortModeSpec, pgtype.Timestamptz{}, pgtype.Timestamptz{}, true))
			require.Empty(t, store.calls)
			require.Equal(t, 73.0, players[0].Bosses[0].PreciseScore)
		})
	}
}

func (s *variantParseStore) InsertParseVariantResult(_ context.Context, p database.InsertParseVariantResultParams) error {
	s.inserted = append(s.inserted, p)
	return nil
}

func TestPersistVariantParsesScoresBothMetricsWithoutChangingUnknown(t *testing.T) {
	t.Parallel()
	store := &variantParseStore{}
	rankings := []database.ListRankingsForInstanceRow{}
	for _, variant := range []string{"normal", "hard", ""} {
		rankings = append(rankings, database.ListRankingsForInstanceRow{PlayerGuid: variant, EncounterName: "Hodir", DifficultyName: "heroic", MaxPlayers: 25, EncounterVariant: pgtype.Text{String: variant, Valid: variant != ""}, PlayerClass: "Warrior", PlayerSpec: "Fury", Dps: 100, Hps: 100})
	}
	require.NoError(t, persistVariantParses(t.Context(), store, uuid.Nil, uuid.New(), rankings, pgtype.Timestamptz{}, pgtype.Timestamptz{}, parsepolicy.CohortModeSpec))
	require.Len(t, store.inserted, 4)
	require.Len(t, store.calls, 4)
	for _, row := range store.inserted {
		require.Contains(t, []string{"normal", "hard"}, row.EncounterVariant)
		require.Equal(t, "heroic", row.DifficultyName)
		require.Equal(t, int16(25), row.MaxPlayers)
		require.Equal(t, int32(30), row.SampleSize)
	}
	require.Equal(t, "dps", store.inserted[0].Metric)
	require.Equal(t, "hps", store.inserted[1].Metric)
	require.Greater(t, store.inserted[0].PreciseScore, store.inserted[2].PreciseScore)
	require.Greater(t, store.inserted[1].PreciseScore, store.inserted[3].PreciseScore)
}

func TestExactVariantUnscoredNeverRetainsCombined(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, spec, status string
		value              float64
	}{
		{"unknown spec", "Unknown", "unknown_spec", 100},
		{"zero metric", "Fury", "sample_too_small", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &variantParseStore{}
			rankings := []database.ListRankingsForInstanceRow{{PlayerGuid: "player", EncounterName: "Hodir", PlayerSpec: tc.spec, EncounterVariant: pgtype.Text{String: "hard", Valid: true}}}
			players := []chroniclesdk.InstanceParsePlayer{{PlayerGUID: "player", Bosses: []chroniclesdk.InstanceParseBoss{{EncounterName: "Hodir", MetricValue: tc.value, PreciseScore: 99, DisplayScore: 99, Rank: 1, SampleSize: 30, Status: "ok"}}}}
			require.NoError(t, applyVariantParses(t.Context(), store, uuid.Nil, uuid.New(), rankings, players, []string{"Hodir"}, parsepolicy.MetricDPS, parsepolicy.CohortModeSpec, pgtype.Timestamptz{}, pgtype.Timestamptz{}, false))
			boss := players[0].Bosses[0]
			require.Equal(t, "hard", *boss.EncounterVariant)
			require.Zero(t, boss.PreciseScore)
			require.Zero(t, boss.DisplayScore)
			require.Zero(t, boss.Rank)
			require.Zero(t, boss.SampleSize)
			require.Equal(t, tc.status, boss.Status)
			require.Nil(t, players[0].AverageParse)
			require.Empty(t, store.calls)
		})
	}
}

func TestVariantScoreInvalidInputsFailClosed(t *testing.T) {
	t.Parallel()
	store := &variantParseStore{cohort: []float64{}}
	cache := make(variantCohortCache)
	params := database.GetParseVariantMembershipCohortParams{EncounterVariant: "hard", Metric: "dps"}
	score, err := cache.score(t.Context(), store, params, 100)
	require.NoError(t, err)
	require.Equal(t, parsepolicy.StatusSampleTooSmall, score.Status)
	_, err = cache.score(t.Context(), store, params, math.NaN())
	require.ErrorContains(t, err, "invalid")
	store.cohort = make([]float64, 30)
	for i := range store.cohort {
		store.cohort[i] = 100
	}
	store.cohort[0] = math.Inf(1)
	_, err = make(variantCohortCache).score(t.Context(), store, params, 100)
	require.ErrorContains(t, err, "invalid")
}
