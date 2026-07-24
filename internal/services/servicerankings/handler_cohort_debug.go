package servicerankings

import (
	"context"
	"net/http"
	"sort"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// cohortQuerier is the subset of database.Store used by the cohort debug handlers.
type cohortQuerier interface {
	ListPublishedSnapshots(ctx context.Context, tenantID uuid.UUID) ([]database.ListPublishedSnapshotsRow, error)
	GetSnapshotCohortDebug(ctx context.Context, arg database.GetSnapshotCohortDebugParams) ([]database.GetSnapshotCohortDebugRow, error)
	ListDistinctCohortBuckets(ctx context.Context, snapshotID uuid.UUID) ([]database.ListDistinctCohortBucketsRow, error)
}

// handleListSnapshots returns published snapshots for the current tenant.
//
//	GET /snapshots
func (s *Service) handleListSnapshots(w http.ResponseWriter, r *http.Request) {
	handleListSnapshotsWithStore(s.store, w, r)
}

func handleListSnapshotsWithStore(store cohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tid := servicetenant.TenantIDFromContext(ctx)

	rows, err := store.ListPublishedSnapshots(ctx, tid)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch snapshots",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.SnapshotSummary, 0, len(rows))
	for _, row := range rows {
		s := chroniclesdk.SnapshotSummary{
			ID:            row.ID,
			LookbackDays:  row.LookbackDays,
			CohortMode:    row.CohortMode,
			PolicyVersion: row.PolicyVersion,
			MemberCount:   row.MemberCount,
		}
		if row.Cutoff.Valid {
			s.Cutoff = row.Cutoff.Time
		}
		if row.PublishedAt.Valid {
			s.PublishedAt = row.PublishedAt.Time
		}
		out = append(out, s)
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

// handleSnapshotCohort returns cohort debug data for a specific snapshot bucket.
//
//	GET /snapshots/{snapshotID}/cohort?encounter_name=...&class=...&spec=...&difficulty=...&max_players=...&metric=dps|hps
func (s *Service) handleSnapshotCohort(w http.ResponseWriter, r *http.Request) {
	handleSnapshotCohortWithStore(s.store, w, r)
}

func handleSnapshotCohortWithStore(store cohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	snapshotIDStr := chi.URLParam(r, "snapshotID")
	snapshotID, err := uuid.Parse(snapshotIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid snapshot ID",
		})
		return
	}

	encounterName := q.Get("encounter_name")
	playerClass := q.Get("class")
	// Without a full bucket selection, return just the available buckets so
	// the UI can populate its dropdowns before the first cohort is chosen.
	if encounterName == "" || playerClass == "" {
		bucketRows, bErr := store.ListDistinctCohortBuckets(ctx, snapshotID)
		if bErr != nil {
			httpapi.HandleResponseError(ctx, w, bErr, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to list cohort buckets",
					Detail:  bErr.Error(),
				},
			})
			return
		}
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CohortDebugResponse{
			SnapshotID: snapshotID,
			Entries:    []chroniclesdk.CohortDebugEntry{},
			Buckets:    convertCohortBuckets(bucketRows),
		})
		return
	}

	metric := "dps"
	if q.Get("metric") == "hps" {
		metric = "hps"
	}

	// Difficulty and raid size are optional: unselected means "any bucket".
	// Chronicle data commonly stores real values (e.g. max_players=40), so
	// filtering on ""/0 when unselected would match nothing.
	var difficulty pgtype.Text
	if v := q.Get("difficulty"); v != "" {
		difficulty = pgtype.Text{String: v, Valid: true}
	}
	var maxPlayers pgtype.Int2
	if v := q.Get("max_players"); v != "" {
		mp, pErr := strconv.Atoi(v)
		if pErr == nil && mp > 0 {
			maxPlayers = pgtype.Int2{Int16: int16(mp), Valid: true}
		}
	}

	var playerSpec pgtype.Text
	if spec := q.Get("spec"); spec != "" {
		playerSpec = pgtype.Text{String: spec, Valid: true}
	}

	// Fetch cohort data with identity fields.
	rows, err := store.GetSnapshotCohortDebug(ctx, database.GetSnapshotCohortDebugParams{
		Metric:         metric,
		SnapshotID:     snapshotID,
		EncounterName:  encounterName,
		DifficultyName: difficulty,
		MaxPlayers:     maxPlayers,
		PlayerClass:    playerClass,
		PlayerSpec:     playerSpec,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch cohort data",
				Detail:  err.Error(),
			},
		})
		return
	}

	// Extract metric values for scoring.
	values := make([]float64, 0, len(rows))
	for _, row := range rows {
		if v, ok := toFloat64(row.MetricValue); ok && v > 0 {
			values = append(values, v)
		}
	}

	// Build entries with computed parse scores.
	entries := make([]chroniclesdk.CohortDebugEntry, 0, len(rows))
	for i, row := range rows {
		v, ok := toFloat64(row.MetricValue)
		if !ok || v <= 0 {
			continue
		}

		entry := chroniclesdk.CohortDebugEntry{
			Rank:          i + 1,
			PlayerName:    row.PlayerName,
			PlayerGUID:    row.PlayerGuid,
			MetricValue:   v,
			LogHashedSlug: row.LogHashedSlug,
		}
		if row.KilledAt.Valid {
			entry.KilledAt = row.KilledAt.Time
		}

		scoreResult, scored := parsepolicy.Score(values, v)
		if scored {
			entry.DisplayScore = scoreResult.DisplayScore
			entry.PreciseScore = scoreResult.PreciseScore
		}

		entries = append(entries, entry)
	}

	// Compute summary stats.
	var minVal, maxVal, medianVal float64
	if len(values) > 0 {
		sorted := make([]float64, len(values))
		copy(sorted, values)
		sort.Float64s(sorted)
		minVal = sorted[0]
		maxVal = sorted[len(sorted)-1]
		mid := len(sorted) / 2
		if len(sorted)%2 == 0 {
			medianVal = (sorted[mid-1] + sorted[mid]) / 2
		} else {
			medianVal = sorted[mid]
		}
	}

	// Fetch available buckets for filter dropdowns.
	bucketRows, err := store.ListDistinctCohortBuckets(ctx, snapshotID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch cohort buckets",
				Detail:  err.Error(),
			},
		})
		return
	}

	buckets := convertCohortBuckets(bucketRows)

	specStr := ""
	if playerSpec.Valid {
		specStr = playerSpec.String
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CohortDebugResponse{
		SnapshotID:    snapshotID,
		EncounterName: encounterName,
		PlayerClass:   normalizeClassName(playerClass),
		PlayerSpec:    specStr,
		Metric:        metric,
		TotalKills:    len(entries),
		MinValue:      minVal,
		MaxValue:      maxVal,
		MedianValue:   medianVal,
		Entries:       entries,
		Buckets:       buckets,
	})
}

func convertCohortBuckets(rows []database.ListDistinctCohortBucketsRow) []chroniclesdk.CohortBucket {
	buckets := make([]chroniclesdk.CohortBucket, 0, len(rows))
	for _, b := range rows {
		buckets = append(buckets, chroniclesdk.CohortBucket{
			EncounterName:  b.EncounterName,
			PlayerClass:    normalizeClassName(b.PlayerClass),
			PlayerSpec:     b.PlayerSpec,
			DifficultyName: b.DifficultyName,
			MaxPlayers:     b.MaxPlayers,
		})
	}
	return buckets
}
