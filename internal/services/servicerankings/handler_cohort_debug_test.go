package servicerankings_test

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleListSnapshots(t *testing.T) {
	t.Parallel()

	t.Run("ReturnsPublishedOnly", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		// Insert rankings so snapshot members can be populated.
		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		for i, dps := range []float64{100, 200, 300, 400, 500} {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("Player-0-%d", i),
				playerName:     fmt.Sprintf("Player%d", i),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            dps,
				difficultyName: "",
				maxPlayers:     0,
				killedAt:       baseTime,
			})
		}

		// Create a published snapshot.
		cutoff := pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}
		snap, err := f.store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.Nil,
			Cutoff:        cutoff,
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			CohortMode:    string(parsepolicy.CohortModeSpec),
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = f.store.BatchInsertSnapshotMembersFromRankings(ctx, snap.ID)
		require.NoError(t, err)
		snap, err = f.store.PublishRankingSnapshot(ctx, snap.ID)
		require.NoError(t, err)

		// Create a pending (unpublished) snapshot.
		_, err = f.store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.Nil,
			Cutoff:        pgtype.Timestamptz{Time: time.Now().Add(2 * time.Hour), Valid: true},
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			CohortMode:    string(parsepolicy.CohortModeSpec),
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  1,
		})
		require.NoError(t, err)

		svc := servicerankings.NewTestableService(f.store, slog.Default())
		r := chi.NewRouter()
		r.Get("/snapshots", svc.HandleListSnapshots)

		req := httptest.NewRequest("GET", "/snapshots", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp []chroniclesdk.SnapshotSummary
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))

		// Only the published snapshot should appear.
		assert.Len(t, resp, 1)
		assert.Equal(t, snap.ID, resp[0].ID)
		assert.Equal(t, int32(parsepolicy.DefaultLookbackDays), resp[0].LookbackDays)
		assert.Greater(t, resp[0].MemberCount, int64(0))
	})

	t.Run("EmptyWhenNoSnapshots", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		svc := servicerankings.NewTestableService(f.store, slog.Default())
		r := chi.NewRouter()
		r.Get("/snapshots", svc.HandleListSnapshots)

		req := httptest.NewRequest("GET", "/snapshots", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp []chroniclesdk.SnapshotSummary
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
		assert.Empty(t, resp)
	})
}

func TestHandleSnapshotCohort(t *testing.T) {
	t.Parallel()

	t.Run("ReturnsSortedValuesWithScores", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		dpsValues := []float64{100, 200, 300, 400, 500, 600}
		for i, dps := range dpsValues {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("Player-0-%d", i),
				playerName:     fmt.Sprintf("Player%d", i),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            dps,
				difficultyName: "",
				maxPlayers:     0,
				killedAt:       baseTime,
			})
		}

		snap := f.publishSnapshot(t)

		svc := servicerankings.NewTestableService(f.store, slog.Default())
		r := chi.NewRouter()
		r.Get("/snapshots/{snapshotID}/cohort", svc.HandleSnapshotCohort)

		url := fmt.Sprintf("/snapshots/%s/cohort?encounter_name=Ragnaros&class=WARRIOR&metric=dps", snap.ID)
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.CohortDebugResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))

		assert.Equal(t, len(dpsValues), resp.TotalKills)
		assert.Equal(t, "dps", resp.Metric)
		assert.Equal(t, "Ragnaros", resp.EncounterName)

		// Entries should be sorted desc by metric value.
		require.Len(t, resp.Entries, len(dpsValues))
		assert.Equal(t, 600.0, resp.Entries[0].MetricValue)
		assert.Equal(t, 100.0, resp.Entries[len(resp.Entries)-1].MetricValue)

		// Top entry should have parse 100.
		assert.Equal(t, 100, resp.Entries[0].DisplayScore)

		// Summary stats.
		assert.Equal(t, 100.0, resp.MinValue)
		assert.Equal(t, 600.0, resp.MaxValue)
		assert.Greater(t, resp.MedianValue, 0.0)

		// Entries should have player names.
		for _, e := range resp.Entries {
			assert.NotEmpty(t, e.PlayerName)
			assert.NotEmpty(t, e.LogHashedSlug)
		}
	})

	t.Run("BucketFiltersIsolate", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		// Insert warriors on Ragnaros.
		for i := 0; i < 6; i++ {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("Warrior-0-%d", i),
				playerName:     fmt.Sprintf("Warrior%d", i),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            float64(100 + i*100),
				difficultyName: "",
				maxPlayers:     0,
				killedAt:       baseTime,
			})
		}
		// Insert mages on Ragnaros.
		for i := 0; i < 6; i++ {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("Mage-0-%d", i),
				playerName:     fmt.Sprintf("Mage%d", i),
				playerClass:    "MAGE",
				playerSpec:     "Fire",
				dps:            float64(200 + i*100),
				difficultyName: "",
				maxPlayers:     0,
				killedAt:       baseTime,
			})
		}

		snap := f.publishSnapshot(t)

		svc := servicerankings.NewTestableService(f.store, slog.Default())
		r := chi.NewRouter()
		r.Get("/snapshots/{snapshotID}/cohort", svc.HandleSnapshotCohort)

		// Query warriors only.
		url := fmt.Sprintf("/snapshots/%s/cohort?encounter_name=Ragnaros&class=WARRIOR&metric=dps", snap.ID)
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.CohortDebugResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))

		assert.Equal(t, 6, resp.TotalKills)
		// All entries should be warriors.
		for _, e := range resp.Entries {
			assert.Contains(t, e.PlayerName, "Warrior")
		}

		// Query mages only.
		url = fmt.Sprintf("/snapshots/%s/cohort?encounter_name=Ragnaros&class=MAGE&metric=dps", snap.ID)
		req = httptest.NewRequest("GET", url, nil)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp2 chroniclesdk.CohortDebugResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp2))

		assert.Equal(t, 6, resp2.TotalKills)
		for _, e := range resp2.Entries {
			assert.Contains(t, e.PlayerName, "Mage")
		}

		// Buckets should contain both classes (normalizeClassName removes underscores
		// but doesn't change case, so WARRIOR → WARRIOR, MAGE → MAGE).
		classSet := make(map[string]bool)
		for _, b := range resp.Buckets {
			classSet[b.PlayerClass] = true
		}
		assert.True(t, classSet["WARRIOR"])
		assert.True(t, classSet["MAGE"])
	})

	t.Run("MissingRequiredParams", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		svc := servicerankings.NewTestableService(f.store, slog.Default())
		r := chi.NewRouter()
		r.Get("/snapshots/{snapshotID}/cohort", svc.HandleSnapshotCohort)

		snap := f.publishSnapshot(t)

		// Missing encounter_name.
		url := fmt.Sprintf("/snapshots/%s/cohort?class=WARRIOR", snap.ID)
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusBadRequest, w.Code)

		// Missing class.
		url = fmt.Sprintf("/snapshots/%s/cohort?encounter_name=Ragnaros", snap.ID)
		req = httptest.NewRequest("GET", url, nil)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("EmptyBucket", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		snap := f.publishSnapshot(t)

		svc := servicerankings.NewTestableService(f.store, slog.Default())
		r := chi.NewRouter()
		r.Get("/snapshots/{snapshotID}/cohort", svc.HandleSnapshotCohort)

		url := fmt.Sprintf("/snapshots/%s/cohort?encounter_name=Nonexistent&class=WARRIOR", snap.ID)
		req := httptest.NewRequest("GET", url, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.CohortDebugResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
		assert.Equal(t, 0, resp.TotalKills)
		assert.Empty(t, resp.Entries)
	})
}
