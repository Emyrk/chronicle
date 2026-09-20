package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func (api *API) ListMyFavorites(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	guildRows, err := api.Opts.Zed.ListUserFavoriteGuilds(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	playerRows, err := api.Opts.Zed.ListUserFavoritePlayers(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	guilds := make([]chroniclesdk.FavoriteGuild, 0, len(guildRows))
	for _, row := range guildRows {
		guilds = append(guilds, chroniclesdk.FavoriteGuild{
			ID:        row.ID,
			Name:      row.Name,
			RealmID:   row.RealmID,
			RealmName: row.RealmName,
			LogoURL:   row.LogoUrl,
		})
	}

	players := make([]chroniclesdk.FavoritePlayer, 0, len(playerRows))
	for _, row := range playerRows {
		var guildID *uuid.UUID
		if row.GuildID.Valid {
			guildID = &row.GuildID.UUID
		}
		players = append(players, chroniclesdk.FavoritePlayer{
			ID:        row.ID,
			RealmID:   row.RealmID,
			RealmName: row.RealmName,
			Name:      row.Name,
			Class:     db2sdk.HeroClass(row.Class).String(),
			Race:      db2sdk.HeroRace(row.Race).String(),
			Gender:    db2sdk.HeroGender(row.Gender).String(),
			Level:     int32(row.Level),
			GuildID:   guildID,
			GuildName: row.GuildName,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.UserFavoritesResponse{
		Guilds:  guilds,
		Players: players,
	})
}

func (api *API) AddMyFavoriteGuild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid guild ID"})
		return
	}
	if _, err := api.Opts.Zed.GetGuildByID(ctx, guildID); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Guild not found"},
			Status:   http.StatusNotFound,
		})
		return
	}
	if err := api.Opts.Zed.AddUserFavoriteGuild(ctx, database.AddUserFavoriteGuildParams{
		UserID:  claims.Subject,
		GuildID: guildID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) DeleteMyFavoriteGuild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	guildID, err := uuid.Parse(chi.URLParam(r, "guildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid guild ID"})
		return
	}
	if err := api.Opts.Zed.DeleteUserFavoriteGuild(ctx, database.DeleteUserFavoriteGuildParams{
		UserID:  claims.Subject,
		GuildID: guildID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) AddMyFavoritePlayer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	realmID, characterGUID, ok := favoritePlayerParams(w, r)
	if !ok {
		return
	}
	if _, err := api.Opts.Zed.GetGamePlayerByGUID(ctx, database.GetGamePlayerByGUIDParams{
		RealmID:    realmID,
		Identifier: characterGUID,
	}); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Player not found"},
			Status:   http.StatusNotFound,
		})
		return
	}
	if err := api.Opts.Zed.AddUserFavoritePlayer(ctx, database.AddUserFavoritePlayerParams{
		UserID:        claims.Subject,
		CharacterGuid: characterGUID,
		RealmID:       realmID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) DeleteMyFavoritePlayer(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	realmID, characterGUID, ok := favoritePlayerParams(w, r)
	if !ok {
		return
	}
	if err := api.Opts.Zed.DeleteUserFavoritePlayer(ctx, database.DeleteUserFavoritePlayerParams{
		UserID:        claims.Subject,
		CharacterGuid: characterGUID,
		RealmID:       realmID,
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func favoritePlayerParams(w http.ResponseWriter, r *http.Request) (uuid.UUID, guid.GUID, bool) {
	ctx := r.Context()
	realmID, err := uuid.Parse(chi.URLParam(r, "realmID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid realm ID"})
		return uuid.Nil, 0, false
	}
	characterGUID, err := guid.FromString(chi.URLParam(r, "characterGUID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid player GUID"})
		return uuid.Nil, 0, false
	}
	return realmID, characterGUID, true
}
