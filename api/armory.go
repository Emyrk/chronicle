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

func (api *API) GetArmoryPlayer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	realmParam := chi.URLParam(r, "realm")
	playerParam := chi.URLParam(r, "player")

	// Resolve realm: try UUID first, then case-insensitive DB name lookup.
	realmID, err := uuid.Parse(realmParam)
	if err != nil {
		realm, dbErr := api.Opts.Zed.GetWoWServerRealmByName(ctx, realmParam)
		if dbErr != nil {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "Realm not found",
			})
			return
		}
		realmID = realm.ID
	}

	// Resolve player: try GUID parse for the identifier field,
	// and always pass the raw string as the name fallback.
	var identifier guid.GUID
	if g, parseErr := guid.FromString(playerParam); parseErr == nil {
		identifier = g
	}

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
