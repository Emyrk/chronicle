package api

import (
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// AdminListUsers returns all users in the system.
// @Summary List all users
// @Tags Admin
// @Success 200 {object} chroniclesdk.AdminUsersResponse
// @Router /api/v1/admin/users [get]
func (a *API) AdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.Opts.DB.ListAllUsers(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := chroniclesdk.AdminUsersResponse{
		Users: make([]chroniclesdk.User, len(users)),
	}
	for i, u := range users {
		roles, err := a.Opts.Zed.UserChronicleRoles(r.Context(), u.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}

		resp.Users[i] = db2sdk.User(u, roles)
	}

	httpapi.Write(r.Context(), w, http.StatusOK, resp)
}

// SetUserDataLimit updates a user's storage limit.
// @Summary Set user data limit
// @Tags Admin
// @Param userID path string true "User ID"
// @Param request body chroniclesdk.SetUserDataLimitRequest true "New storage limit"
// @Success 200 {object} chroniclesdk.User
// @Router /api/v1/admin/users/{userID}/data-limit [put]
func (a *API) SetUserDataLimit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userIDStr := chi.URLParam(r, "userID")

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid user ID",
			Detail:  err.Error(),
		})
		return
	}

	actor, _ := authz.ActorFromContext(ctx)
	b := policy.New()

	ok, err := a.Zed.CheckOne(ctx, nil, b.GlobalChronicle().CanSet_user_data_limit_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	var req chroniclesdk.SetUserDataLimitRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	_, err = a.Opts.DB.SetUserStorageLimit(ctx, database.SetUserStorageLimitParams{
		UserID:          userID,
		MaxStorageBytes: req.MaxStorageBytes,
		UpdatedAt:       pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Fetch updated user to return
	user, err := a.Opts.DB.GetUserByID(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	roles, err := a.Opts.Zed.UserChronicleRoles(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.User(user, roles))
}

// AdminResyncUserRoles re-syncs a user's primary roles from Discord.
// @Summary Resync user roles from Discord
// @Tags Admin
// @Param userID path string true "User ID"
// @Success 200 {object} chroniclesdk.User
// @Router /api/v1/admin/users/{userID}/resync [post]
func (a *API) AdminResyncUserRoles(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userID")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": "Invalid user ID",
		})
		return
	}

	// Get the user's Discord link
	link, err := a.Opts.DB.GetUserAuthLinkByUserID(r.Context(), userID)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusNotFound, map[string]string{
			"message": "User has no linked Discord account",
		})
		return
	}

	if link.Provider != "discord" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, map[string]string{
			"message": "User is not linked via Discord",
		})
		return
	}

	// Resync via bot
	if a.Opts.Bot == nil {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, map[string]string{
			"message": "Discord bot not configured",
		})
		return
	}

	err = a.Opts.Bot.SyncDiscordUser(r.Context(), a.Opts.Zed, link.LinkedID, userID)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, map[string]string{
			"message": "Failed to sync user roles: " + err.Error(),
		})
		return
	}

	// Fetch updated user
	user, err := a.Opts.DB.GetUserByID(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	roles, err := a.Opts.Zed.UserChronicleRoles(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(r.Context(), w, http.StatusOK, db2sdk.User(user, roles))
}

// AdminListLogs returns all logs in the system.
// @Summary List all logs
// @Tags Admin
// @Success 200 {object} chroniclesdk.AdminLogsResponse
// @Router /api/v1/admin/logs [get]
func (a *API) AdminListLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := a.Opts.DB.ListAllWoWLogGroupsWithOwner(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := chroniclesdk.AdminLogsResponse{
		Logs: make([]chroniclesdk.AdminLog, len(logs)),
	}
	for i, l := range logs {
		state := "unknown"
		if l.ProcessingOutput != nil {
			// Try to extract state from processing output
			state = "processed"
		}

		ownerName := ""
		if l.OwnerName.Valid {
			ownerName = l.OwnerName.String
		}

		resp.Logs[i] = chroniclesdk.AdminLog{
			ID:          l.WoWLogGroup.ID,
			OwnerID:     l.WoWLogGroup.Owner,
			OwnerName:   ownerName,
			Description: "", // Could be enhanced later
			CreatedAt:   l.WoWLogGroup.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
			State:       state,
		}
	}

	httpapi.Write(r.Context(), w, http.StatusOK, resp)
}
