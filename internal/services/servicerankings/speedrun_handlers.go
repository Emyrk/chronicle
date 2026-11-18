package servicerankings

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/slice"
)

func speedrunUsesRankedTiming(value string) (bool, bool) {
	switch value {
	case "", "full":
		return false, true
	case "ranked":
		return true, true
	default:
		return false, false
	}
}

// handleSpeedrunLeaderboard returns the best qualified speedrun per duplicate
// group for a given instance name.
//
//	GET /speedrun?instance_name=Molten+Core&realm_name=Turtle+WoW&timing=ranked
//
// timing defaults to full; ranked re-ranks by the boss-to-boss duration.
// board defaults to guild best; all keeps every distinct qualifying run.
// limit defaults to 50 (maximum 200); offset defaults to zero.
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
	filterInstanceSize := r.URL.Query().Has("instance_max_players")
	var instanceSize int16
	if filterInstanceSize {
		parsed, err := strconv.ParseInt(r.URL.Query().Get("instance_max_players"), 10, 16)
		if err != nil || parsed < 0 {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_max_players must be a non-negative number"})
			return
		}
		instanceSize = int16(parsed)
	}

	useRankedTiming, validTiming := speedrunUsesRankedTiming(r.URL.Query().Get("timing"))
	if !validTiming {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "timing query parameter must be ranked or full",
		})
		return
	}

	board := r.URL.Query().Get("board")
	if board != "" && board != "guild" && board != "all" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "board query parameter must be guild or all"})
		return
	}

	limit, offset, err := speedrunPagination(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}

	rows, err := s.store.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		ResultLimit:              limit,
		ResultOffset:             offset,
		AllRuns:                  board == "all",
		InstanceName:             instanceName,
		RealmNames:               realmNames,
		MinPlayers:               minPlayers,
		MaxPlayers:               maxPlayers,
		GuildID:                  guildID,
		SinceDays:                sinceDays,
		FilterDifficulty:         filterDifficulty,
		FilterInstanceMaxPlayers: filterInstanceSize,
		InstanceMaxPlayers:       instanceSize,
		DifficultyName:           difficultyName,
		UseRankedTiming:          useRankedTiming,
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

// speedrunPagination keeps the legacy 50-row default and bounds public page sizes.
func speedrunPagination(r *http.Request) (int64, int64, error) {
	limit, offset := int64(50), int64(0)
	if value := r.URL.Query().Get("limit"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed < 1 {
			return 0, 0, fmt.Errorf("limit must be a positive integer")
		}
		limit = min(parsed, 200)
	}
	if value := r.URL.Query().Get("offset"); value != "" {
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed < 0 {
			return 0, 0, fmt.Errorf("offset must be a non-negative integer")
		}
		offset = parsed
	}
	return limit, offset, nil
}

// handleSpeedrunInstances returns the list of (instance, difficulty) boards
// that have qualified speedruns, each with its record. Each difficulty has its
// own board.
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
		if row.RecordCompletionTime.Valid {
			boards[i].Record = &chroniclesdk.SpeedrunBoardRecord{
				DurationMs:     row.RecordDurationMs,
				CompletionTime: row.RecordCompletionTime.Time,
				GuildName:      row.RecordGuildName,
				InstanceID:     row.RecordInstanceID,
				HasPositions:   row.RecordHasPositions,
			}
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
