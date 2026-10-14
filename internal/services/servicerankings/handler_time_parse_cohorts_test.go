package servicerankings_test

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func timeParseCohortRouter(store database.Store) http.Handler {
	svc := servicerankings.NewTestableService(store, slog.Default())
	r := chi.NewRouter()
	r.Get("/time-parse-snapshots", svc.HandleListTimeParseSnapshots)
	r.Get("/time-parse-snapshots/{snapshotID}/buckets", svc.HandleTimeParseCohortBuckets)
	r.Get("/time-parse-snapshots/{snapshotID}/cohort", svc.HandleTimeParseCohort)
	return r
}

func getTimeParseCohortJSON(t *testing.T, router http.Handler, path string, out any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	if rec.Code == http.StatusOK && out != nil {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), out))
	}
	return rec.Code
}

func TestTimeParseCohortViewer(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	baseTime := time.Date(2024, 7, 1, 12, 0, 0, 0, time.UTC)
	cutoff := time.Date(2024, 8, 1, 0, 0, 0, 0, time.UTC)

	// Six runs with distinct Ragnaros kill and clear times, inserted out of
	// order so the response ordering is meaningful.
	killSeconds := []int{90, 30, 60, 120, 45, 75}
	instanceByKill := make(map[int64]uuid.UUID, len(killSeconds))
	for i, seconds := range killSeconds {
		start := baseTime.Add(time.Duration(i) * 24 * time.Hour)
		clearMs := int64(1_000_000 + seconds*1000)
		killStart := start.Add(10 * time.Minute)
		instanceID := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
			instanceName:   "Molten Core",
			difficultyName: "Normal",
			maxPlayers:     40,
			qualified:      true,
			durationMs:     clearMs,
			startTime:      start,
			encounters: []timeParseEncounterOpts{{
				name:      "Ragnaros",
				killType:  database.KillTypeClean,
				boss:      true,
				startTime: killStart,
				endTime:   killStart.Add(time.Duration(seconds) * time.Second),
			}},
		})
		instanceByKill[int64(seconds*1000)] = instanceID
	}
	runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

	router := timeParseCohortRouter(store)

	var snapshots []chroniclesdk.TimeParseSnapshotSummary
	require.Equal(t, http.StatusOK, getTimeParseCohortJSON(t, router, "/time-parse-snapshots", &snapshots))
	require.Len(t, snapshots, 1)
	snapshotPath := "/time-parse-snapshots/" + snapshots[0].ID.String()

	t.Run("Buckets", func(t *testing.T) {
		t.Parallel()
		var resp chroniclesdk.TimeParseCohortBucketsResponse
		require.Equal(t, http.StatusOK, getTimeParseCohortJSON(t, router, snapshotPath+"/buckets", &resp))
		assert.ElementsMatch(t, []chroniclesdk.TimeParseCohortBucket{
			{Kind: chroniclesdk.TimeParseCohortKindBossKill, InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Normal", MaxPlayers: 40, SampleSize: 6},
			{Kind: chroniclesdk.TimeParseCohortKindClearTime, InstanceName: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40, SampleSize: 6},
		}, resp.Buckets)
	})

	t.Run("BossKillCohort", func(t *testing.T) {
		t.Parallel()
		var resp chroniclesdk.TimeParseCohortResponse
		require.Equal(t, http.StatusOK, getTimeParseCohortJSON(t, router,
			snapshotPath+"/cohort?kind=boss_kill&instance_name=Molten+Core&encounter_name=Ragnaros&difficulty=Normal&max_players=40", &resp))
		assert.Equal(t, 6, resp.SampleSize)
		require.Len(t, resp.Entries, 6)

		// Fastest first, ranked and scored against the cohort.
		wantDurations := []int64{30_000, 45_000, 60_000, 75_000, 90_000, 120_000}
		for i, entry := range resp.Entries {
			assert.Equal(t, wantDurations[i], entry.DurationMs)
			assert.Equal(t, i+1, entry.Rank)
			assert.Equal(t, instanceByKill[entry.DurationMs], entry.InstanceID)
		}
		assert.Equal(t, 100, resp.Entries[0].DisplayScore)
		assert.Equal(t, 17, resp.Entries[5].DisplayScore)
	})

	t.Run("ClearTimeCohort", func(t *testing.T) {
		t.Parallel()
		var resp chroniclesdk.TimeParseCohortResponse
		require.Equal(t, http.StatusOK, getTimeParseCohortJSON(t, router,
			snapshotPath+"/cohort?kind=clear_time&instance_name=Molten+Core&difficulty=Normal&max_players=40", &resp))
		require.Len(t, resp.Entries, 6)
		assert.Empty(t, resp.EncounterName)
		assert.Equal(t, int64(1_030_000), resp.Entries[0].DurationMs)
		assert.Equal(t, 1, resp.Entries[0].Rank)
		assert.Equal(t, int64(1_120_000), resp.Entries[5].DurationMs)
	})

	t.Run("EmptyBucket", func(t *testing.T) {
		t.Parallel()
		var resp chroniclesdk.TimeParseCohortResponse
		require.Equal(t, http.StatusOK, getTimeParseCohortJSON(t, router,
			snapshotPath+"/cohort?kind=boss_kill&instance_name=Molten+Core&encounter_name=Ragnaros&difficulty=Normal&max_players=20", &resp))
		assert.Empty(t, resp.Entries)
		assert.NotNil(t, resp.Entries)
		assert.Equal(t, "sample_too_small", resp.Status)
	})

	t.Run("InvalidRequests", func(t *testing.T) {
		t.Parallel()
		cohort := snapshotPath + "/cohort?instance_name=Molten+Core&difficulty=Normal&max_players=40"
		assert.Equal(t, http.StatusBadRequest, getTimeParseCohortJSON(t, router, cohort+"&kind=nope", nil))
		assert.Equal(t, http.StatusBadRequest, getTimeParseCohortJSON(t, router, cohort+"&kind=boss_kill", nil), "boss kills need an encounter")
		assert.Equal(t, http.StatusBadRequest, getTimeParseCohortJSON(t, router,
			snapshotPath+"/cohort?kind=clear_time&instance_name=Molten+Core&difficulty=Normal", nil), "max_players is required")
		assert.Equal(t, http.StatusBadRequest, getTimeParseCohortJSON(t, router, "/time-parse-snapshots/not-a-uuid/buckets", nil))
		assert.Equal(t, http.StatusNotFound, getTimeParseCohortJSON(t, router, "/time-parse-snapshots/"+uuid.NewString()+"/buckets", nil))
	})
}
