package servicerankings_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestEncounterVariantMembershipsKeepCombinedAndIsolateMetrics(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		boss     string
		variants []string
	}{
		{"Hodir", []string{"normal", "hard"}},
		{"Yogg-Saron", []string{"lights_0", "lights_1", "lights_2", "lights_3", "lights_4"}},
	} {
		t.Run(tc.boss, func(t *testing.T) { t.Parallel(); testVariantMemberships(t, tc.boss, tc.variants) })
	}
}

func testVariantMemberships(t *testing.T, boss string, variants []string) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool := newSingleConnectionPool(t)
	store := database.New(pool)
	cutoff := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)
	fixture := setupScoringFixture(t, pool, store)
	for i, variant := range append(append([]string{}, variants...), "") {
		if i > 0 {
			fixture.instanceID = uuid.New()
			_, err := store.InsertInstance(ctx, database.InsertInstanceParams{ID: fixture.instanceID, RealmID: fixture.realmID, LogGroupID: fixture.logGroupID, Name: "Molten Core", Capabilities: []string{}, StartTime: database.Timestamptz(cutoff.Add(-2 * time.Hour))})
			require.NoError(t, err)
		}
		encounterID := uuid.New()
		killed := cutoff.Add(-time.Hour)
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: fixture.instanceID, Name: boss, Boss: true,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{},
			StartTime: database.Timestamptz(killed.Add(-time.Minute)), EndTime: database.Timestamptz(killed),
			EncounterVariant: pgtype.Text{String: variant, Valid: variant != ""},
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: fixture.instanceID,
			EncounterName: boss, InstanceName: "Molten Core", PlayerGuid: "player", PlayerName: "Player",
			PlayerClass: "WARRIOR", PlayerSpec: "Fury", PlayerRole: "dps", RealmID: fixture.realmID, RealmName: "test-realm",
			DamageDone: int64((i + 1) * 10000), HealingDone: int64((i + 1) * 20000), DurationSecs: 100,
			Dps: float64((i + 1) * 100), Hps: float64((i + 1) * 200), KilledAt: database.Timestamptz(killed),
			EncounterVariant: pgtype.Text{String: variant, Valid: variant != ""},
		}))
		refreshScoringMemberships(t, ctx, store, fixture.logGroupID)
		refreshScoringMemberships(t, ctx, store, fixture.logGroupID) // idempotent, including variant projection
	}
	for _, metric := range []string{"dps", "hps"} {
		scale := 100.0
		if metric == "hps" {
			scale = 200
		}
		combined, err := store.GetParseScoreMembershipCohort(ctx, database.GetParseScoreMembershipCohortParams{
			Metric: metric, TenantID: uuid.Nil, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
			Cutoff: database.Timestamptz(cutoff), ExcludeRunID: uuid.New(), EncounterName: boss, PlayerClass: "WARRIOR",
			CohortMode: string(parsepolicy.CohortModeSpec), PlayerSpec: "Fury",
		})
		require.NoError(t, err)
		expected := make([]float64, len(variants)+1)
		for i := range expected {
			expected[i] = scale * float64(i+1)
		}
		require.ElementsMatch(t, expected, combined, "Combined includes unknown and every exact tier")
		for i, variant := range variants {
			params := database.GetParseVariantMembershipCohortParams{
				Metric: metric, TenantID: uuid.Nil, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
				Cutoff: database.Timestamptz(cutoff), ExcludeRunID: uuid.New(), EncounterName: boss, PlayerClass: "WARRIOR",
				CohortMode: string(parsepolicy.CohortModeSpec), PlayerSpec: "Fury", EncounterVariant: variant,
			}
			cohort, err := store.GetParseVariantMembershipCohort(ctx, params)
			require.NoError(t, err)
			require.Equal(t, []float64{scale * float64(i+1)}, cohort)
			params.MaxPlayers = 25
			cohort, err = store.GetParseVariantMembershipCohort(ctx, params)
			require.NoError(t, err)
			require.Empty(t, cohort, "size must match independently of variant")
			params.MaxPlayers = 0
			params.DifficultyName = "heroic"
			cohort, err = store.GetParseVariantMembershipCohort(ctx, params)
			require.NoError(t, err)
			require.Empty(t, cohort, "difficulty must match independently of variant")
		}
	}
	require.NoError(t, store.DeleteParseScoreMembershipsByLogGroup(ctx, fixture.logGroupID))
	normal, err := store.GetParseVariantMembershipCohort(ctx, database.GetParseVariantMembershipCohortParams{
		Metric: "dps", TenantID: uuid.Nil, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
		Cutoff: database.Timestamptz(cutoff), ExcludeRunID: uuid.New(), EncounterName: boss, PlayerClass: "WARRIOR",
		CohortMode: string(parsepolicy.CohortModeSpec), PlayerSpec: "Fury", EncounterVariant: variants[0],
	})
	require.NoError(t, err)
	require.Empty(t, normal, "unlisting/deletion invalidates variant membership too")
}
