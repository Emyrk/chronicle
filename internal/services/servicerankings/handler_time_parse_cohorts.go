package servicerankings

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// timeParseCohortQuerier is the database subset used by the time-parse cohort
// viewer handlers.
type timeParseCohortQuerier interface {
	ListPublishedTimeParseSnapshots(ctx context.Context, arg database.ListPublishedTimeParseSnapshotsParams) ([]database.TimeParseSnapshot, error)
	GetPublishedTimeParseSnapshotByID(ctx context.Context, arg database.GetPublishedTimeParseSnapshotByIDParams) (database.TimeParseSnapshot, error)
	ListTimeParseBossKillCohortBuckets(ctx context.Context, snapshotID uuid.UUID) ([]database.ListTimeParseBossKillCohortBucketsRow, error)
	ListTimeParseClearTimeCohortBuckets(ctx context.Context, snapshotID uuid.UUID) ([]database.ListTimeParseClearTimeCohortBucketsRow, error)
	GetTimeParseBossKillCohortEntries(ctx context.Context, arg database.GetTimeParseBossKillCohortEntriesParams) ([]database.GetTimeParseBossKillCohortEntriesRow, error)
	GetTimeParseClearTimeCohortEntries(ctx context.Context, arg database.GetTimeParseClearTimeCohortEntriesParams) ([]database.GetTimeParseClearTimeCohortEntriesRow, error)
}

// handleListTimeParseSnapshots returns published time-parse snapshots for the
// current tenant and scoring version.
//
//	GET /time-parse-snapshots
func (s *Service) handleListTimeParseSnapshots(w http.ResponseWriter, r *http.Request) {
	handleListTimeParseSnapshotsWithStore(s.store, w, r)
}

func handleListTimeParseSnapshotsWithStore(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := store.ListPublishedTimeParseSnapshots(ctx, database.ListPublishedTimeParseSnapshotsParams{
		TenantID:      servicetenant.TenantIDFromContext(ctx),
		PolicyVersion: timeparsepolicy.PolicyVersion,
		QueryVersion:  timeparsepolicy.SnapshotQueryVersion,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch time-parse snapshots",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.TimeParseSnapshotSummary, 0, len(rows))
	for _, row := range rows {
		summary := chroniclesdk.TimeParseSnapshotSummary{
			ID:           row.ID,
			Cutoff:       row.Cutoff.Time,
			LookbackDays: row.LookbackDays,
			PublishedAt:  row.PublishedAt.Time,
		}
		if row.WindowStart.Valid {
			windowStart := row.WindowStart.Time
			summary.WindowStart = &windowStart
		}
		out = append(out, summary)
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

// resolveTimeParseSnapshot loads the snapshot named in the URL, scoped to the
// caller's tenant. It writes the error response and returns false on failure.
func resolveTimeParseSnapshot(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) (database.TimeParseSnapshot, bool) {
	ctx := r.Context()
	snapshotID, err := uuid.Parse(chi.URLParam(r, "snapshotID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid snapshot ID",
		})
		return database.TimeParseSnapshot{}, false
	}

	snapshot, err := store.GetPublishedTimeParseSnapshotByID(ctx, database.GetPublishedTimeParseSnapshotByIDParams{
		ID:       snapshotID,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Time-parse snapshot not found",
		})
		return database.TimeParseSnapshot{}, false
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch time-parse snapshot",
				Detail:  err.Error(),
			},
		})
		return database.TimeParseSnapshot{}, false
	}
	return snapshot, true
}

// handleTimeParseCohortBuckets lists the boss-kill and clear-time buckets in
// a snapshot so the viewer can populate its pickers.
//
//	GET /time-parse-snapshots/{snapshotID}/buckets
func (s *Service) handleTimeParseCohortBuckets(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortBucketsWithStore(s.store, w, r)
}

func handleTimeParseCohortBucketsWithStore(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	snapshot, ok := resolveTimeParseSnapshot(store, w, r)
	if !ok {
		return
	}

	bossRows, err := store.ListTimeParseBossKillCohortBuckets(ctx, snapshot.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to list boss kill buckets",
				Detail:  err.Error(),
			},
		})
		return
	}
	clearRows, err := store.ListTimeParseClearTimeCohortBuckets(ctx, snapshot.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to list clear time buckets",
				Detail:  err.Error(),
			},
		})
		return
	}

	buckets := make([]chroniclesdk.TimeParseCohortBucket, 0, len(bossRows)+len(clearRows))
	for _, row := range bossRows {
		buckets = append(buckets, chroniclesdk.TimeParseCohortBucket{
			Kind:           chroniclesdk.TimeParseCohortKindBossKill,
			InstanceName:   row.InstanceName,
			EncounterName:  row.EncounterName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			SampleSize:     row.SampleSize,
		})
	}
	for _, row := range clearRows {
		buckets = append(buckets, chroniclesdk.TimeParseCohortBucket{
			Kind:           chroniclesdk.TimeParseCohortKindClearTime,
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			SampleSize:     row.SampleSize,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TimeParseCohortBucketsResponse{
		SnapshotID: snapshot.ID,
		Buckets:    buckets,
	})
}

// newTimeParseCohortEntry builds an unscored cohort entry from the identity
// fields shared by boss-kill and clear-time rows.
func newTimeParseCohortEntry(instanceID uuid.UUID, durationMs int64, killedAt time.Time, logSlug string, guildID uuid.NullUUID, guildName string) chroniclesdk.TimeParseCohortEntry {
	entry := chroniclesdk.TimeParseCohortEntry{
		DurationMs:    durationMs,
		KilledAt:      killedAt,
		InstanceID:    instanceID,
		LogHashedSlug: logSlug,
		GuildName:     guildName,
	}
	if guildID.Valid {
		id := guildID.UUID
		entry.GuildID = &id
	}
	return entry
}

// handleTimeParseCohort returns every run in one bucket, fastest first, each
// scored against the bucket. Difficulty and raid size are required because a
// time-parse cohort is always an exact bucket.
//
//	GET /time-parse-snapshots/{snapshotID}/cohort?kind=boss_kill|clear_time&instance_name=...&encounter_name=...&difficulty=...&max_players=...
func (s *Service) handleTimeParseCohort(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortWithStore(s.store, w, r)
}

func handleTimeParseCohortWithStore(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	kind := chroniclesdk.TimeParseCohortKind(q.Get("kind"))
	instanceName := q.Get("instance_name")
	encounterName := q.Get("encounter_name")
	difficulty := q.Get("difficulty")
	maxPlayers, mpErr := strconv.ParseInt(q.Get("max_players"), 10, 16)

	switch {
	case kind != chroniclesdk.TimeParseCohortKindBossKill && kind != chroniclesdk.TimeParseCohortKindClearTime:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "kind must be boss_kill or clear_time",
		})
		return
	case instanceName == "":
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name is required",
		})
		return
	case kind == chroniclesdk.TimeParseCohortKindBossKill && encounterName == "":
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "encounter_name is required for boss_kill cohorts",
		})
		return
	case mpErr != nil || maxPlayers < 0:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "max_players must be a non-negative integer",
		})
		return
	}

	snapshot, ok := resolveTimeParseSnapshot(store, w, r)
	if !ok {
		return
	}

	var entries []chroniclesdk.TimeParseCohortEntry
	var err error
	if kind == chroniclesdk.TimeParseCohortKindBossKill {
		var dbRows []database.GetTimeParseBossKillCohortEntriesRow
		dbRows, err = store.GetTimeParseBossKillCohortEntries(ctx, database.GetTimeParseBossKillCohortEntriesParams{
			SnapshotID:     snapshot.ID,
			InstanceName:   instanceName,
			EncounterName:  encounterName,
			DifficultyName: difficulty,
			MaxPlayers:     int16(maxPlayers),
		})
		for _, row := range dbRows {
			entries = append(entries, newTimeParseCohortEntry(row.InstanceID, row.DurationMs, row.KilledAt.Time, row.LogHashedSlug.String, row.GuildID, row.GuildName.String))
		}
	} else {
		encounterName = ""
		var dbRows []database.GetTimeParseClearTimeCohortEntriesRow
		dbRows, err = store.GetTimeParseClearTimeCohortEntries(ctx, database.GetTimeParseClearTimeCohortEntriesParams{
			SnapshotID:     snapshot.ID,
			InstanceName:   instanceName,
			DifficultyName: difficulty,
			MaxPlayers:     int16(maxPlayers),
		})
		for _, row := range dbRows {
			entries = append(entries, newTimeParseCohortEntry(row.InstanceID, row.DurationMs, row.KilledAt.Time, row.LogHashedSlug.String, row.GuildID, row.GuildName.String))
		}
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch time-parse cohort",
				Detail:  err.Error(),
			},
		})
		return
	}

	if entries == nil {
		entries = []chroniclesdk.TimeParseCohortEntry{}
	}
	durations := make([]int64, len(entries))
	for i, entry := range entries {
		durations[i] = entry.DurationMs
	}
	scores, _ := timeparsepolicy.ScoreCohort(durations)

	status := timeparsepolicy.StatusSampleTooSmall
	for i := range entries {
		entries[i].Rank = scores[i].Rank
		entries[i].PreciseScore = scores[i].PreciseScore
		entries[i].DisplayScore = scores[i].DisplayScore
		if scores[i].Status != "" {
			status = scores[i].Status
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TimeParseCohortResponse{
		SnapshotID:     snapshot.ID,
		Kind:           kind,
		InstanceName:   instanceName,
		EncounterName:  encounterName,
		DifficultyName: difficulty,
		MaxPlayers:     int16(maxPlayers),
		SampleSize:     len(entries),
		Status:         string(status),
		Entries:        entries,
	})
}
