package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func parseArmoryPlayerGUID(player string) guid.GUID {
	if id, err := guid.FromString(player); err == nil {
		return id
	}
	if id, err := strconv.ParseUint(player, 10, 32); err == nil {
		return guid.GUID(id)
	}
	return 0
}

// resolveArmoryPlayer resolves the {realm}/{player} URL params to a stored
// player row. The realm may be a UUID or a case-insensitive realm name; the
// player may be a canonical GUID, a decimal uint32 game ID, or a name. On
// failure it writes the error response and returns ok=false.
func (api *API) resolveArmoryPlayer(w http.ResponseWriter, r *http.Request) (database.GetGamePlayerByGUIDRow, uuid.UUID, bool) {
	ctx := r.Context()
	realmParam := chi.URLParam(r, "realm")
	playerParam := chi.URLParam(r, "player")

	realmID, err := uuid.Parse(realmParam)
	if err != nil {
		realm, dbErr := api.Opts.Zed.GetWoWServerRealmByName(ctx, realmParam)
		if dbErr != nil {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Realm not found",
			})
			return database.GetGamePlayerByGUIDRow{}, uuid.Nil, false
		}
		realmID = realm.ID
	}

	identifier := parseArmoryPlayerGUID(playerParam)

	player, err := api.Opts.Zed.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{
		RealmID:    realmID,
		Identifier: identifier,
		Name:       playerParam,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Player not found",
			},
			Status: http.StatusNotFound,
		})
		return database.GetGamePlayerByGUIDRow{}, uuid.Nil, false
	}

	return player, realmID, true
}

func (api *API) GetArmoryPlayer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	player, realmID, ok := api.resolveArmoryPlayer(w, r)
	if !ok {
		return
	}

	out := db2sdk.ArmoryPlayer(player)
	out.DatasetID = api.Opts.Dataset.ResolveDatasetForRealm(ctx, realmID)
	if ds, err := api.Opts.Dataset.GetDataset(ctx, out.DatasetID); err == nil {
		out.IconBaseURL = ds.IconBaseUrl
	}
	w.Header().Set(httpapi.DatasetHeader, out.DatasetID.String())
	httpapi.Write(ctx, w, http.StatusOK, out)
}

// GetArmoryPlayerGearHistory returns per-instance gear snapshots for a
// player, newest first.
func (api *API) GetArmoryPlayerGearHistory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	player, realmID, ok := api.resolveArmoryPlayer(w, r)
	if !ok {
		return
	}

	limit := int32(100)
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = min(int32(parsed), 200)
		}
	}

	rows, err := api.Opts.Zed.GetPlayerGearHistory(ctx, database.GetPlayerGearHistoryParams{
		RealmID:     realmID,
		PlayerID:    player.ID,
		ResultLimit: limit,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	snapshots := make([]chroniclesdk.ArmoryGearSnapshot, 0, len(rows))
	for _, row := range rows {
		snapshots = append(snapshots, db2sdk.ArmoryGearSnapshot(row))
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ArmoryGearHistoryResponse{
		Snapshots: snapshots,
	})
}

// GetArmoryPlayerLoot returns loot the character received, newest first.
// Duplicate uploads of the same raid night are collapsed.
func (api *API) GetArmoryPlayerLoot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	player, realmID, ok := api.resolveArmoryPlayer(w, r)
	if !ok {
		return
	}

	limit := int32(50)
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = min(int32(parsed), 200)
		}
	}

	datasetID := api.Opts.Dataset.ResolveDatasetForRealm(ctx, realmID)
	rows, err := api.Opts.Zed.GetCharacterLoot(ctx, database.GetCharacterLootParams{
		RealmID:      realmID,
		ReceivedGuid: int64(player.ID),
		DatasetID:    datasetID,
		ResultLimit:  limit,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	items := make([]chroniclesdk.ArmoryLootItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, chroniclesdk.ArmoryLootItem{
			ItemID:       row.ItemID,
			ItemName:     row.ItemName,
			Quality:      row.Quality,
			Icon:         row.Icon,
			Quantity:     row.Quantity,
			InstanceID:   row.InstanceID,
			InstanceName: row.InstanceName,
			InstanceSlug: row.InstanceSlug.String,
			ReceivedAt:   row.ReceivedTs.Time,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ArmoryLootResponse{Items: items})
}

func (api *API) SearchArmoryPlayers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query()

	searchTerm := query.Get("q")
	if len(searchTerm) < 2 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Search term must be at least 2 characters",
		})
		return
	}

	filterClass := query.Get("class")
	filterGuild := query.Get("guild")

	var filterRealm uuid.UUID
	if realmStr := query.Get("realm"); realmStr != "" {
		var err error
		filterRealm, err = uuid.Parse(realmStr)
		if err != nil {
			realm, dbErr := api.Opts.Zed.GetWoWServerRealmByName(ctx, realmStr)
			if dbErr != nil {
				httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
					Message: "Invalid realm",
				})
				return
			}
			filterRealm = realm.ID
		}
	}

	limit := int32(25)
	if l := query.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = int32(parsed)
		}
		if limit > 50 {
			limit = 50
		}
	}

	offset := int32(0)
	if o := query.Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = int32(parsed)
		}
	}

	rows, err := api.Opts.Zed.SearchGamePlayers(ctx, database.SearchGamePlayersParams{
		SearchTerm:   pgtype.Text{String: searchTerm, Valid: true},
		FilterClass:  filterClass,
		FilterRealm:  filterRealm,
		FilterGuild:  filterGuild,
		ResultLimit:  limit,
		ResultOffset: offset,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	results := make([]chroniclesdk.ArmorySearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, db2sdk.ArmorySearchResult(row))
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ArmorySearchResponse{
		Players: results,
		Count:   len(results),
	})
}
