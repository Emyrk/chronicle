package servicerankings

import (
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/slice"
)

// handleSpeedrunLeaderboard returns the best qualified speedrun per duplicate
// group for a given instance name.
//
//	GET /speedrun?instance_name=Molten+Core&realm_name=Turtle+WoW&timing=ranked
//
// timing defaults to ranked; full re-ranks by the complete clear duration.
func (s *Service) handleSpeedrunLeaderboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	realmNames := r.URL.Query()["realm_name"]

	var minPlayers, maxPlayers int64
	if v := r.URL.Query().Get("min_players"); v != "" {
		minPlayers, _ = strconv.ParseInt(v, 10, 64)
	}
	if v := r.URL.Query().Get("max_players"); v != "" {
		maxPlayers, _ = strconv.ParseInt(v, 10, 64)
	}

	guildID := r.URL.Query().Get("guild_id")

	var sinceDays int64
	if v := r.URL.Query().Get("since_days"); v != "" {
		sinceDays, _ = strconv.ParseInt(v, 10, 64)
	}

	// Each difficulty has its own board. The presence of the parameter (even
	// empty, which matches runs with no recorded difficulty) enables the filter.
	filterDifficulty := r.URL.Query().Has("difficulty_name")
	difficultyName := r.URL.Query().Get("difficulty_name")

	timing := r.URL.Query().Get("timing")
	if timing == "" {
		timing = "ranked"
	}
	if timing != "ranked" && timing != "full" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "timing query parameter must be ranked or full",
		})
		return
	}

	rows, err := s.store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName:     instanceName,
		RealmNames:       realmNames,
		MinPlayers:       minPlayers,
		MaxPlayers:       maxPlayers,
		GuildID:          guildID,
		SinceDays:        sinceDays,
		FilterDifficulty: filterDifficulty,
		DifficultyName:   difficultyName,
		UseRankedTiming:  timing == "ranked",
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch speedrun leaderboard",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, slice.List(rows, db2sdk.SpeedrunLeaderboardEntry))
}

// handleSpeedrunInstances returns the list of (instance, difficulty) boards
// that have qualified speedruns. Each difficulty has its own board.
//
//	GET /speedrun/instances
func (s *Service) handleSpeedrunInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := s.store.SpeedrunInstanceBoards(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch speedrun instance boards",
				Detail:  err.Error(),
			},
		})
		return
	}

	boards := make([]chroniclesdk.SpeedrunInstanceBoard, len(rows))
	for i, row := range rows {
		boards[i] = chroniclesdk.SpeedrunInstanceBoard{
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, boards)
}

// handleSpeedrunRealms returns the list of realm names that have qualified speedruns.
//
//	GET /speedrun/realms
func (s *Service) handleSpeedrunRealms(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	names, err := s.store.SpeedrunRealmNames(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch speedrun realm names",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, names)
}

// handleSpeedrunDifficulties returns the list of difficulty names that have
// qualified speedruns for a given instance. Each difficulty has its own board.
//
//	GET /speedrun/difficulties?instance_name=...
func (s *Service) handleSpeedrunDifficulties(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	names, err := s.store.SpeedrunDifficulties(ctx, instanceName)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch speedrun difficulties",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, names)
}

// handleSpeedrunRules returns the speedrun requirements for a given instance.
//
//	GET /speedrun/rules?instance_name=...
func (s *Service) handleSpeedrunRules(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	allRules := s.registry.SpeedrunRules()
	rules, ok := allRules[instanceName]
	if !ok {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "No speedrun rules found for instance",
		})
		return
	}

	sdkReqs := make([]chroniclesdk.SpeedrunRequirement, len(rules.Requirements))
	for i, req := range rules.Requirements {
		sdkReqs[i] = chroniclesdk.SpeedrunRequirement{
			Name:     req.Name,
			EntryIDs: req.EntryIDs,
			Count:    req.Count,
			Category: string(req.Category),
		}
	}

	resp := chroniclesdk.SpeedrunRulesResponse{
		InstanceName: instanceName,
		Requirements: sdkReqs,
	}
	if rules.LevelRange != nil {
		resp.LevelRange = &chroniclesdk.SpeedrunLevelRangeRequirement{
			MinLevel: rules.LevelRange.MinLevel,
			MaxLevel: rules.LevelRange.MaxLevel,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// handleSpeedrunGuildClears returns guilds ranked by qualified full clears of
// the given instance.
//
//	GET /speedrun/guild-clears?instance_name=Molten+Core&difficulty_name=&limit=5
func (s *Service) handleSpeedrunGuildClears(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	// Each difficulty has its own board. The presence of the parameter (even
	// empty, which matches runs with no recorded difficulty) enables the filter.
	filterDifficulty := r.URL.Query().Has("difficulty_name")
	difficultyName := r.URL.Query().Get("difficulty_name")

	limit := int64(10)
	if v := r.URL.Query().Get("limit"); v != "" {
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	rows, err := s.store.SpeedrunGuildClears(ctx, database.SpeedrunGuildClearsParams{
		InstanceName:     instanceName,
		FilterDifficulty: filterDifficulty,
		DifficultyName:   difficultyName,
		ResultLimit:      limit,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild clears",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, slice.List(rows, db2sdk.SpeedrunGuildClearsEntry))
}
