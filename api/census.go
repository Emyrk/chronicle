package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

// censusDefaultDays is the census page's default window.
const censusDefaultDays = 90

// Census returns player counts grouped by class and race.
//
//	@Summary	Census player counts
//	@Tags		Census
//	@Produce	json
//	@Param		days		query	int		false	"Number of days to look back (default 90, max 365)"
//	@Param		realm_id	query	[]string	false	"Realm IDs to filter by (repeatable)"
//	@Success	200	{array}	chroniclesdk.CensusEntry
//	@Router		/census [get]
func (api *API) Census(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse days parameter (default 90, clamp 1-365)
	days := censusDefaultDays
	if d := r.URL.Query().Get("days"); d != "" {
		parsed, err := strconv.Atoi(d)
		if err != nil || parsed < 1 {
			parsed = 1
		} else if parsed > 365 {
			parsed = 365
		}
		days = parsed
	}

	// Parse realm_id parameters
	realmStrs := r.URL.Query()["realm_id"]
	realmIDs := make([]uuid.UUID, 0, len(realmStrs))
	for _, s := range realmStrs {
		id, err := uuid.Parse(s)
		if err != nil {
			continue
		}
		realmIDs = append(realmIDs, id)
	}

	fetch := func(ctx context.Context) ([]database.CensusPlayerCountsRow, error) {
		return api.Opts.Zed.CensusPlayerCounts(ctx, database.CensusPlayerCountsParams{
			UpdatedAfter: pgtype.Timestamptz{
				Time:  time.Now().AddDate(0, 0, -days),
				Valid: true,
			},
			RealmIds: realmIDs,
		})
	}
	var (
		rows []database.CensusPlayerCountsRow
		err  error
	)
	// The page's default view scans the tenant's players, so it is cached per
	// tenant (refreshed hourly in the background). Filtered views are rarer
	// and keyed by request input, so they still query directly.
	if days == censusDefaultDays && len(realmIDs) == 0 {
		rows, err = api.censusCache.Load(ctx, api.Opts.Logger, fetch)
	} else {
		rows, err = fetch(ctx)
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch census data",
				Detail:  err.Error(),
			},
		})
		return
	}

	entries := make([]chroniclesdk.CensusEntry, 0, len(rows))
	for _, row := range rows {
		var faction *types.HeroFaction
		if row.Faction.Valid {
			value := types.HeroFaction(row.Faction.WowPlayerFaction)
			faction = &value
		}
		entries = append(entries, chroniclesdk.CensusEntry{
			Class:   db2sdk.HeroClass(row.Class).String(),
			Race:    db2sdk.HeroRace(row.Race).String(),
			Faction: faction,
			Count:   row.Count,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=300")
	httpapi.Write(ctx, w, http.StatusOK, entries)
}
