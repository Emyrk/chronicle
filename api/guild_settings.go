package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func settingsToSDK(s database.GuildSetting) chroniclesdk.GuildSettings {
	out := chroniclesdk.GuildSettings{GuildID: s.GuildID}
	if s.AllowJoinRequestsUntil.Valid {
		t := s.AllowJoinRequestsUntil.Time
		out.AllowJoinRequestsUntil = &t
	}
	return out
}

func joinRequestsOpen(s database.GuildSetting) bool {
	return s.AllowJoinRequestsUntil.Valid && s.AllowJoinRequestsUntil.Time.After(time.Now())
}

// GetGuildSettings returns the guild settings (public, used by join button).
func (api *API) GetGuildSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	settings, err := api.Zed.GetGuildSettings(ctx, guild.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildSettings{GuildID: guild.ID})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, settingsToSDK(settings))
}

// UpdateGuildSettings updates the guild settings (admin only).
func (api *API) UpdateGuildSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	var req chroniclesdk.UpdateGuildSettingsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	var until pgtype.Timestamptz
	if req.AllowJoinRequestsUntil != nil {
		until = pgtype.Timestamptz{Time: *req.AllowJoinRequestsUntil, Valid: true}
	}

	settings, err := api.Zed.UpsertGuildSettings(ctx, database.UpsertGuildSettingsParams{
		GuildID:                guild.ID,
		AllowJoinRequestsUntil: until,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, settingsToSDK(settings))
}

// CreateJoinRequest submits a join request for the authenticated user.
func (api *API) CreateJoinRequest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)
	claims := chronauth.MustAuthenticatedClaims(ctx)
	userID := claims.Subject

	var req chroniclesdk.CreateJoinRequestBody
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	// Check allow_join_requests is enabled
	settings, err := api.Zed.GetGuildSettings(ctx, guild.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	if errors.Is(err, pgx.ErrNoRows) || !joinRequestsOpen(settings) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "This guild is not accepting join requests.",
		})
		return
	}

	// Check user is not already a member (via SpiceDB)
	members, err := api.Zed.GuildRosterMembers(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	for _, m := range members {
		if m.UserID == userID {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "You are already a member of this guild.",
			})
			return
		}
	}

	// Check no existing pending request
	_, err = api.Zed.GetGuildJoinRequestByUser(ctx, database.GetGuildJoinRequestByUserParams{
		GuildID: guild.ID,
		UserID:  userID,
	})
	if err == nil {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
			Message: "You already have a pending join request.",
		})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}

	// Truncate message
	msg := req.Message
	if len(msg) > 500 {
		msg = msg[:500]
	}

	joinReq, err := api.Zed.CreateGuildJoinRequest(ctx, database.CreateGuildJoinRequestParams{
		GuildID: guild.ID,
		UserID:  userID,
		Message: msg,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Fetch username for the response
	users, err := api.Opts.Zed.GetUsersByIDs(ctx, []uuid.UUID{userID})
	username := ""
	if err == nil && len(users) > 0 {
		username = users[0].Username
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.GuildJoinRequest{
		ID:        joinReq.ID,
		GuildID:   joinReq.GuildID,
		UserID:    joinReq.UserID,
		Username:  username,
		Message:   joinReq.Message,
		CreatedAt: joinReq.CreatedAt.Time,
	})
}

// ListJoinRequests returns pending join requests for a guild (admin only).
func (api *API) ListJoinRequests(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	rows, err := api.Zed.ListGuildJoinRequests(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	result := make([]chroniclesdk.GuildJoinRequest, 0, len(rows))
	for _, row := range rows {
		result = append(result, chroniclesdk.GuildJoinRequest{
			ID:        row.ID,
			GuildID:   row.GuildID,
			UserID:    row.UserID,
			Username:  row.Username,
			Message:   row.Message,
			CreatedAt: row.CreatedAt.Time,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, result)
}

// AcceptJoinRequest accepts a join request and adds the user as a guild member.
func (api *API) AcceptJoinRequest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	requestID, err := uuid.Parse(chi.URLParam(r, "requestID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid request ID",
		})
		return
	}

	// Find the join request
	rows, err := api.Zed.ListGuildJoinRequests(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	var found *database.ListGuildJoinRequestsRow
	for _, row := range rows {
		if row.ID == requestID {
			found = &row
			break
		}
	}
	if found == nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Join request not found",
		})
		return
	}

	// Add user as guild member (writes SpiceDB relation via interceptor)
	_, err = api.Opts.Zed.InsertGuildMember(ctx, database.InsertGuildMemberParams{
		GuildID: guild.ID,
		UserID:  found.UserID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Delete the join request
	err = api.Zed.DeleteGuildJoinRequest(ctx, database.DeleteGuildJoinRequestParams{
		ID:      requestID,
		GuildID: guild.ID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Join request accepted",
	})
}

// DenyJoinRequest denies (deletes) a join request.
func (api *API) DenyJoinRequest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	requestID, err := uuid.Parse(chi.URLParam(r, "requestID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid request ID",
		})
		return
	}

	err = api.Zed.DeleteGuildJoinRequest(ctx, database.DeleteGuildJoinRequestParams{
		ID:      requestID,
		GuildID: guild.ID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Join request denied",
	})
}

// MyJoinRequest returns the current user's pending join request for a guild, if any.
func (api *API) MyJoinRequest(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)
	claims := chronauth.MustAuthenticatedClaims(ctx)

	joinReq, err := api.Zed.GetGuildJoinRequestByUser(ctx, database.GetGuildJoinRequestByUserParams{
		GuildID: guild.ID,
		UserID:  claims.Subject,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
				Message: "No pending join request",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildJoinRequest{
		ID:        joinReq.ID,
		GuildID:   joinReq.GuildID,
		UserID:    joinReq.UserID,
		Message:   joinReq.Message,
		CreatedAt: joinReq.CreatedAt.Time,
	})
}
