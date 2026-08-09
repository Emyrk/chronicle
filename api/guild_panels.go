package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// GuildCharacterRoster returns the guild's characters seen in raid logs.
// Used by the guild page "Roster" panel.
//
//	GET /api/v1/guilds/{guildID}/characters?seen_within_days=60&limit=100
func (api *API) GuildCharacterRoster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	var seenWithinDays int64
	if v := r.URL.Query().Get("seen_within_days"); v != "" {
		seenWithinDays, _ = strconv.ParseInt(v, 10, 64)
	}

	limit := int32(100)
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = min(int32(parsed), 500)
		}
	}

	rows, err := api.Opts.Zed.GuildCharacterRoster(ctx, database.GuildCharacterRosterParams{
		TenantID:        servicetenant.TenantIDFromContext(ctx),
		GuildID:         guild.ID,
		SeenWithinDays:  seenWithinDays,
		ParseWindowDays: int32(parsepolicy.DefaultLookbackDays),
		RowLimit:        limit,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild roster",
				Detail:  err.Error(),
			},
		})
		return
	}

	members := make([]chroniclesdk.GuildRosterCharacter, len(rows))
	for i, row := range rows {
		members[i] = chroniclesdk.GuildRosterCharacter{
			ID:         row.ID,
			Name:       row.Name,
			Class:      db2sdk.HeroClass(row.Class).String(),
			Race:       db2sdk.HeroRace(row.Race).String(),
			Level:      int32(row.Level),
			Spec:       row.PlayerSpec,
			Role:       row.PlayerRole,
			AvgParse:   row.AvgParse,
			LastSeenAt: row.UpdatedAt.Time,
			RealmName:  row.RealmName,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildCharacterRosterResponse{
		Members: members,
	})
}

// GuildTopParses returns the guild's best parses.
// Used by the guild page "Top Parses" panel.
//
//	GET /api/v1/guilds/{guildID}/parses/top?metric=dps&since_days=60&limit=10&best_per_player=true
func (api *API) GuildTopParses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)
	q := r.URL.Query()

	metric := "dps"
	if q.Get("metric") == "hps" {
		metric = "hps"
	}

	var sinceDays int64
	if v := q.Get("since_days"); v != "" {
		sinceDays, _ = strconv.ParseInt(v, 10, 64)
	}

	limit := int32(10)
	if v := q.Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			limit = min(int32(parsed), 100)
		}
	}

	rows, err := api.Opts.Zed.GuildTopParses(ctx, database.GuildTopParsesParams{
		TenantID:      servicetenant.TenantIDFromContext(ctx),
		GuildID:       guild.ID,
		Metric:        metric,
		SinceDays:     sinceDays,
		BestPerPlayer: q.Get("best_per_player") != "false",
		RowLimit:      limit,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild top parses",
				Detail:  err.Error(),
			},
		})
		return
	}

	parses := make([]chroniclesdk.GuildTopParse, len(rows))
	for i, row := range rows {
		parses[i] = chroniclesdk.GuildTopParse{
			PlayerGUID:     row.PlayerGuid,
			PlayerName:     row.PlayerName,
			PlayerClass:    row.PlayerClass,
			PlayerSpec:     row.PlayerSpec,
			PlayerRole:     row.PlayerRole,
			EncounterName:  row.EncounterName,
			InstanceID:     row.InstanceID,
			InstanceSlug:   row.InstanceSlug,
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			Metric:         metric,
			MetricValue:    row.MetricValue,
			DisplayScore:   int(row.DisplayScore),
			KilledAt:       row.KilledAt.Time,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildTopParsesResponse{
		Metric: metric,
		Parses: parses,
	})
}

// GuildBestRuns returns the guild's best full clear of each instance within
// the window. Used by the guild page "Best Performance" panel.
//
//	GET /api/v1/guilds/{guildID}/best-runs?since_days=60&by=parse
func (api *API) GuildBestRuns(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	var sinceDays int64
	if v := r.URL.Query().Get("since_days"); v != "" {
		sinceDays, _ = strconv.ParseInt(v, 10, 64)
	}

	rows, err := api.Opts.Zed.GuildBestRuns(ctx, database.GuildBestRunsParams{
		TenantID:  servicetenant.TenantIDFromContext(ctx),
		GuildID:   guild.ID,
		SinceDays: sinceDays,
		ByParse:   r.URL.Query().Get("by") == "parse",
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild best runs",
				Detail:  err.Error(),
			},
		})
		return
	}

	runs := make([]chroniclesdk.GuildBestRun, len(rows))
	for i, row := range rows {
		runs[i] = chroniclesdk.GuildBestRun{
			RunID:          row.RunID,
			InstanceID:     row.InstanceID,
			InstanceSlug:   row.InstanceSlug,
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			DurationMs:     row.DurationMs,
			CompletedAt:    row.CompletionTime.Time,
			AvgParse:       row.AvgParse,
			ParseCount:     row.ParseCount,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildBestRunsResponse{
		Runs: runs,
	})
}

// GuildEncounterKills returns the guild's per-encounter boss kill counts.
// Used by the guild page "Progression" panel.
//
//	GET /api/v1/guilds/{guildID}/encounters
func (api *API) GuildEncounterKills(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	rows, err := api.Opts.Zed.GuildEncounterKills(ctx, guild.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild encounter kills",
				Detail:  err.Error(),
			},
		})
		return
	}

	deathRows, err := api.Opts.Zed.GuildInstanceDeaths(ctx, guild.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild instance deaths",
				Detail:  err.Error(),
			},
		})
		return
	}

	encounters := make([]chroniclesdk.GuildEncounterKill, len(rows))
	for i, row := range rows {
		encounters[i] = chroniclesdk.GuildEncounterKill{
			InstanceName:   row.InstanceName,
			EncounterName:  row.EncounterName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			Kills:          row.Kills,
			FirstKilledAt:  row.FirstKilledAt.Time,
			LastKilledAt:   row.LastKilledAt.Time,
		}
	}

	deaths := make([]chroniclesdk.GuildInstanceDeaths, len(deathRows))
	for i, row := range deathRows {
		deaths[i] = chroniclesdk.GuildInstanceDeaths{
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			Deaths:         row.Deaths,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildEncounterKillsResponse{
		Encounters:     encounters,
		InstanceDeaths: deaths,
	})
}

// GuildRunParses returns the guild's average parse per raid night (run).
// Used by the guild page "Recent" panel to show a score per raid.
//
//	GET /api/v1/guilds/{guildID}/parses/runs?run_ids=<uuid>,<uuid>
func (api *API) GuildRunParses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	var runIDs []uuid.UUID
	for _, raw := range strings.Split(r.URL.Query().Get("run_ids"), ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		id, err := uuid.Parse(raw)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid run_ids",
				Detail:  err.Error(),
			})
			return
		}
		runIDs = append(runIDs, id)
	}
	if len(runIDs) == 0 || len(runIDs) > 100 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "run_ids must contain between 1 and 100 ids",
		})
		return
	}

	rows, err := api.Opts.Zed.GuildRunParseAverages(ctx, database.GuildRunParseAveragesParams{
		TenantID: servicetenant.TenantIDFromContext(ctx),
		GuildID:  guild.ID,
		RunIds:   runIDs,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild run parses",
				Detail:  err.Error(),
			},
		})
		return
	}

	encounters := make([]chroniclesdk.GuildRunEncounterParse, len(rows))
	for i, row := range rows {
		encounters[i] = chroniclesdk.GuildRunEncounterParse{
			RunID:          row.RunID,
			EncounterName:  row.EncounterName,
			AvgParse:       row.AvgParse,
			ParseCount:     row.ParseCount,
			KilledAt:       row.KilledAt.Time,
			KillDurationMs: row.KillDurationMs,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildRunParsesResponse{
		Encounters: encounters,
	})
}
