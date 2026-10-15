package servicerankings_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func callTimeParseJSON[T any](t *testing.T, handler func(http.ResponseWriter, *http.Request), path string) T {
	t.Helper()
	w := httptest.NewRecorder()
	handler(w, httptest.NewRequest(http.MethodGet, path, nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var response T
	require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
	return response
}

func TestTimeParseSpreads_MatchCohortScores(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupRankingsTest(t)
	svc := servicerankings.NewTestableService(store, nil)
	ctx := testutil.Context(t, testutil.WaitShort)

	// Any log group satisfies the membership foreign key.
	_, instanceID := insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC), dps: 1, hps: 1,
		playerClass: "MAGE", playerSpec: "Fire", difficulty: "Normal", maxPlayers: 40, playerGUID: cohortGUID(1),
	})
	var logGroupID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT log_group_id FROM parse_score_memberships LIMIT 1`).Scan(&logGroupID))

	killedAt := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)
	insertKill := func(instanceName, encounter string, durationMs int64, at time.Time) {
		_, err := pool.Exec(ctx, `
			INSERT INTO time_parse_boss_kill_memberships (tenant_id, policy_version, query_version, run_id, encounter_name,
				instance_id, log_group_id, instance_name, difficulty_name, max_players, duration_ms, killed_at)
			VALUES ('00000000-0000-0000-0000-000000000000', $1, $2, $3, $4, $5, $6, $7, 'Normal', 40, $8, $9)`,
			int16(timeparsepolicy.PolicyVersion), timeparsepolicy.QueryVersion, uuid.New(), encounter,
			instanceID, logGroupID, instanceName, durationMs, at)
		require.NoError(t, err)
	}
	for i := 1; i <= 12; i++ {
		insertKill("Molten Core", "Ragnaros", int64(i)*10_000, killedAt)
		_, err := pool.Exec(ctx, `
			INSERT INTO time_parse_clear_time_memberships (tenant_id, policy_version, query_version, run_id,
				instance_id, log_group_id, instance_name, difficulty_name, max_players, duration_ms, start_time)
			VALUES ('00000000-0000-0000-0000-000000000000', $1, $2, $3, $4, $5, 'Molten Core', 'Normal', 40, $6, $7)`,
			int16(timeparsepolicy.PolicyVersion), timeparsepolicy.QueryVersion, uuid.New(), instanceID, logGroupID,
			int64(i)*600_000, killedAt)
		require.NoError(t, err)
	}
	insertKill("Molten Core", "Lucifron", 30_000, killedAt)
	insertKill("Blackwing Lair", "Razorgore the Untamed", 1_000, killedAt)                            // other instance
	insertKill("Molten Core", "Ragnaros", 1_000, time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)) // outside window

	spreads := callTimeParseJSON[chroniclesdk.TimeParseSpreadsResponse](t, svc.HandleTimeParseSpreads,
		"/time-parse-cohorts/spreads?date=2026-10-15&instance_name=Molten+Core")
	require.Len(t, spreads.Spreads, 3)
	clear, lucifron, ragnaros := spreads.Spreads[0], spreads.Spreads[1], spreads.Spreads[2]
	assert.Equal(t, chroniclesdk.TimeParseCohortKindClearTime, clear.Kind, "clear time first")
	assert.Equal(t, "Lucifron", lucifron.EncounterName)
	assert.Equal(t, "sample_too_small", lucifron.Status)
	for _, cutoff := range lucifron.Cutoffs {
		assert.Nil(t, cutoff.DurationMs, "unscored cohorts have no cutoffs")
	}

	assert.Equal(t, "Ragnaros", ragnaros.EncounterName)
	assert.Equal(t, 12, ragnaros.SampleSize)
	assert.Equal(t, int64(10_000), ragnaros.MinMs)
	assert.Equal(t, int64(65_000), ragnaros.MedianMs)
	assert.Equal(t, int64(120_000), ragnaros.MaxMs)

	// Each cutoff is the slowest kill the cohort viewer scores at or above it.
	for _, spread := range []chroniclesdk.TimeParseSpread{clear, ragnaros} {
		path := "/time-parse-cohorts/cohort?date=2026-10-15&instance_name=Molten+Core&difficulty=Normal&max_players=40&kind=" + string(spread.Kind)
		if spread.EncounterName != "" {
			path += "&encounter_name=" + spread.EncounterName
		}
		cohort := callTimeParseJSON[chroniclesdk.TimeParseCohortResponse](t, svc.HandleTimeParseCohort, path)
		assert.Equal(t, cohort.Status, spread.Status)
		for _, cutoff := range spread.Cutoffs {
			var want *int64
			for _, entry := range cohort.Entries {
				if entry.DisplayScore >= cutoff.Floor && (want == nil || entry.DurationMs > *want) {
					duration := entry.DurationMs
					want = &duration
				}
			}
			assert.Equal(t, want, cutoff.DurationMs, "%s floor %d", spread.Kind, cutoff.Floor)
		}
	}
}
