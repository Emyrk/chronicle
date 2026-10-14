package servicerankings

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type timeParseCohortQuerier interface {
	ListTimeParseBossKillCohortBuckets(context.Context, database.ListTimeParseBossKillCohortBucketsParams) ([]database.ListTimeParseBossKillCohortBucketsRow, error)
	ListTimeParseClearTimeCohortBuckets(context.Context, database.ListTimeParseClearTimeCohortBucketsParams) ([]database.ListTimeParseClearTimeCohortBucketsRow, error)
	GetTimeParseBossKillCohortEntries(context.Context, database.GetTimeParseBossKillCohortEntriesParams) ([]database.GetTimeParseBossKillCohortEntriesRow, error)
	GetTimeParseClearTimeCohortEntries(context.Context, database.GetTimeParseClearTimeCohortEntriesParams) ([]database.GetTimeParseClearTimeCohortEntriesRow, error)
}

func liveCohortQueryWindow(w http.ResponseWriter, r *http.Request) (liveTimeParseWindow, bool) {
	window, err := parseLiveTimeParseWindow(r.URL.Query(), true, time.Now())
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid time-parse window", Detail: err.Error()})
		return liveTimeParseWindow{}, false
	}
	return window, true
}

func (s *Service) handleTimeParseCohortBuckets(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortBucketsWithStore(s.store, w, r)
}

func handleTimeParseCohortBucketsWithStore(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	window, ok := liveCohortQueryWindow(w, r)
	if !ok {
		return
	}
	tenantID := servicetenant.TenantIDFromContext(ctx)
	policyVersion := int16(timeparsepolicy.PolicyVersion)
	queryVersion := timeparsepolicy.QueryVersion
	cutoff := pgtype.Timestamptz{Time: window.Cutoff, Valid: true}

	bossRows, err := store.ListTimeParseBossKillCohortBuckets(ctx, database.ListTimeParseBossKillCohortBucketsParams{
		TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		Cutoff: cutoff, WindowStart: window.WindowStart,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to list boss kill buckets", Detail: err.Error()}})
		return
	}
	clearRows, err := store.ListTimeParseClearTimeCohortBuckets(ctx, database.ListTimeParseClearTimeCohortBucketsParams{
		TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		Cutoff: cutoff, WindowStart: window.WindowStart,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to list clear time buckets", Detail: err.Error()}})
		return
	}

	buckets := make([]chroniclesdk.TimeParseCohortBucket, 0, len(bossRows)+len(clearRows))
	for _, row := range bossRows {
		buckets = append(buckets, chroniclesdk.TimeParseCohortBucket{Kind: chroniclesdk.TimeParseCohortKindBossKill, InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, SampleSize: row.SampleSize})
	}
	for _, row := range clearRows {
		buckets = append(buckets, chroniclesdk.TimeParseCohortBucket{Kind: chroniclesdk.TimeParseCohortKindClearTime, InstanceName: row.InstanceName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, SampleSize: row.SampleSize})
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TimeParseCohortBucketsResponse{Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays, Buckets: buckets})
}

func newTimeParseCohortEntry(instanceID uuid.UUID, durationMs int64, killedAt time.Time, logSlug string, guildID uuid.NullUUID, guildName string) chroniclesdk.TimeParseCohortEntry {
	entry := chroniclesdk.TimeParseCohortEntry{DurationMs: durationMs, KilledAt: killedAt, InstanceID: instanceID, LogHashedSlug: logSlug, GuildName: guildName}
	if guildID.Valid {
		id := guildID.UUID
		entry.GuildID = &id
	}
	return entry
}

func (s *Service) handleTimeParseCohort(w http.ResponseWriter, r *http.Request) {
	handleTimeParseCohortWithStore(s.store, w, r)
}

func handleTimeParseCohortWithStore(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query()
	window, ok := liveCohortQueryWindow(w, r)
	if !ok {
		return
	}
	kind := chroniclesdk.TimeParseCohortKind(query.Get("kind"))
	instanceName := query.Get("instance_name")
	encounterName := query.Get("encounter_name")
	difficulty := query.Get("difficulty")
	maxPlayers, maxPlayersErr := strconv.ParseInt(query.Get("max_players"), 10, 16)
	switch {
	case kind != chroniclesdk.TimeParseCohortKindBossKill && kind != chroniclesdk.TimeParseCohortKindClearTime:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "kind must be boss_kill or clear_time"})
		return
	case instanceName == "":
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_name is required"})
		return
	case kind == chroniclesdk.TimeParseCohortKindBossKill && encounterName == "":
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "encounter_name is required for boss_kill cohorts"})
		return
	case maxPlayersErr != nil || maxPlayers < 0:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "max_players must be a non-negative integer"})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	policyVersion := int16(timeparsepolicy.PolicyVersion)
	queryVersion := timeparsepolicy.QueryVersion
	cutoff := pgtype.Timestamptz{Time: window.Cutoff, Valid: true}
	entries := make([]chroniclesdk.TimeParseCohortEntry, 0)
	var err error
	if kind == chroniclesdk.TimeParseCohortKindBossKill {
		var rows []database.GetTimeParseBossKillCohortEntriesRow
		rows, err = store.GetTimeParseBossKillCohortEntries(ctx, database.GetTimeParseBossKillCohortEntriesParams{
			TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion, Cutoff: cutoff, WindowStart: window.WindowStart,
			InstanceName: instanceName, EncounterName: encounterName, DifficultyName: difficulty, MaxPlayers: int16(maxPlayers),
		})
		for _, row := range rows {
			entries = append(entries, newTimeParseCohortEntry(row.InstanceID, row.DurationMs, row.KilledAt.Time, row.LogHashedSlug.String, row.GuildID, row.GuildName.String))
		}
	} else {
		encounterName = ""
		var rows []database.GetTimeParseClearTimeCohortEntriesRow
		rows, err = store.GetTimeParseClearTimeCohortEntries(ctx, database.GetTimeParseClearTimeCohortEntriesParams{
			TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion, Cutoff: cutoff, WindowStart: window.WindowStart,
			InstanceName: instanceName, DifficultyName: difficulty, MaxPlayers: int16(maxPlayers),
		})
		for _, row := range rows {
			entries = append(entries, newTimeParseCohortEntry(row.InstanceID, row.DurationMs, row.KilledAt.Time, row.LogHashedSlug.String, row.GuildID, row.GuildName.String))
		}
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch time-parse cohort", Detail: err.Error()}})
		return
	}

	durations := make([]int64, len(entries))
	for i := range entries {
		durations[i] = entries[i].DurationMs
	}
	scores, _ := timeparsepolicy.ScoreCohort(durations)
	status := timeparsepolicy.StatusSampleTooSmall
	for i := range entries {
		entries[i].Rank, entries[i].PreciseScore, entries[i].DisplayScore = scores[i].Rank, scores[i].PreciseScore, scores[i].DisplayScore
		if scores[i].Status != "" {
			status = scores[i].Status
		}
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TimeParseCohortResponse{
		Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays,
		Kind: kind, InstanceName: instanceName, EncounterName: encounterName, DifficultyName: difficulty,
		MaxPlayers: int16(maxPlayers), SampleSize: len(entries), Status: string(status), Entries: entries,
	})
}
