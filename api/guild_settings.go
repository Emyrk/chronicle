package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/cryptorand"
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

func (api *API) discordIntegrationSettingsToSDK(ctx context.Context, guildID uuid.UUID) (chroniclesdk.GuildDiscordIntegrationSettings, error) {
	enabled, err := api.Zed.IsGuildDiscordBotEnabled(ctx, guildID)
	if err != nil {
		return chroniclesdk.GuildDiscordIntegrationSettings{}, err
	}

	out := chroniclesdk.GuildDiscordIntegrationSettings{
		Enabled:   enabled,
		Available: api.Opts.Bot.Available(),
	}
	if actor, ok := authz.ActorFromContext(ctx); ok {
		out.CanEnable, err = api.Zed.CheckOne(
			ctx,
			nil,
			policy.New().GlobalChronicle().CanAdminister_authz_User(actor),
		)
		if err != nil {
			return chroniclesdk.GuildDiscordIntegrationSettings{}, err
		}
	}
	return out, nil
}

func (api *API) guildDiscordInstallationToSDK(ctx context.Context, guildID uuid.UUID) (chroniclesdk.GuildDiscordIntegrationSettings, error) {
	out, err := api.discordIntegrationSettingsToSDK(ctx, guildID)
	if err != nil {
		return chroniclesdk.GuildDiscordIntegrationSettings{}, err
	}
	if out.Enabled && out.Available {
		out.InstallURL = fmt.Sprintf("/api/v1/guilds/%s/settings/discord-integration/install", guildID)
	}

	installation, err := api.Zed.GetGuildDiscordInstallation(ctx, guildID)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return chroniclesdk.GuildDiscordIntegrationSettings{}, err
	}
	out.Installed = true
	out.DiscordGuildID = installation.DiscordGuildID
	out.DiscordGuildName = installation.DiscordGuildName
	return out, nil
}

func joinRequestsOpen(s database.GuildSetting) bool {
	return s.AllowJoinRequestsUntil.Valid && s.AllowJoinRequestsUntil.Time.After(time.Now())
}

// GetGuildSettings returns the guild settings (public, used by join button).
func (api *API) GetGuildSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	// Check if the caller is a member (optional auth, so may not be logged in)
	isMember := false
	if claims, ok := chronauth.AuthenticatedClaims(ctx); ok {
		isMember, _ = api.Zed.IsGuildMember(ctx, guild.ID, claims.Subject)
	}

	settings, err := api.Zed.GetGuildSettings(ctx, guild.ID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		settings.GuildID = guild.ID
	}

	resp := settingsToSDK(settings)
	resp.IsMember = isMember
	httpapi.Write(ctx, w, http.StatusOK, resp)
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

// GetGuildDiscordIntegration returns Discord integration settings to guild administrators.
func (api *API) GetGuildDiscordIntegration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	resp, err := api.guildDiscordInstallationToSDK(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// UpdateGuildDiscordIntegration grants or revokes Discord linking for a guild.
// Route middleware restricts this operation to authorization administrators.
func (api *API) UpdateGuildDiscordIntegration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	var req chroniclesdk.UpdateGuildDiscordIntegrationRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.Enabled && !api.Opts.Bot.Available() {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Discord bot integration is not supported on this Chronicle deployment.",
		})
		return
	}

	if err := api.Zed.SetGuildDiscordBotEnabled(ctx, guild.ID, req.Enabled); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp, err := api.guildDiscordInstallationToSDK(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

const discordOAuthTokenURL = "https://discord.com/api/oauth2/token"

func (api *API) discordInstallCallbackURL() string {
	return api.Opts.AccessURL.ResolveReference(&url.URL{
		Path: "/api/v1/discord-integration/callback",
	}).String()
}

// BeginGuildDiscordInstall starts Discord's required OAuth2 code-grant flow.
func (api *API) BeginGuildDiscordInstall(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)
	claims := chronauth.MustAuthenticatedClaims(ctx)

	enabled, err := api.Zed.IsGuildDiscordBotEnabled(ctx, guild.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !enabled || !api.Opts.Bot.Available() || api.Opts.Discord.ClientID == "" || api.Opts.Discord.ClientSecret == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Discord integration is not available for this guild."})
		return
	}

	state, err := cryptorand.String(48)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	_, err = api.Zed.CreateGuildDiscordInstallState(ctx, database.CreateGuildDiscordInstallStateParams{
		State:     state,
		GuildID:   guild.ID,
		UserID:    claims.Subject,
		ExpiresAt: database.Timestamptz(time.Now().Add(10 * time.Minute)),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	query := url.Values{
		"client_id":        {api.Opts.Discord.ClientID},
		"response_type":    {"code"},
		"scope":            {"bot applications.commands"},
		"integration_type": {"0"},
		"permissions":      {"117760"},
		"redirect_uri":     {api.discordInstallCallbackURL()},
		"state":            {state},
	}
	http.Redirect(w, r, "https://discord.com/oauth2/authorize?"+query.Encode(), http.StatusTemporaryRedirect)
}

type discordInstallTokenResponse struct {
	Guild struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"guild"`
}

// CompleteGuildDiscordInstall verifies Discord's callback and saves the selected server.
func (api *API) CompleteGuildDiscordInstall(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	state, err := api.Zed.ConsumeGuildDiscordInstallState(ctx, r.URL.Query().Get("state"))
	if err != nil || state.UserID != claims.Subject {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Discord installation request is invalid or expired."})
		return
	}
	canAdmin, err := api.Zed.CheckOne(
		ctx,
		nil,
		policy.New().Guild(state.GuildID).CanAdmin_guild_User(policy.New().User(claims.Subject)),
	)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !canAdmin {
		httpapi.Forbidden(w, fmt.Errorf("user can no longer administer guild %s", state.GuildID))
		return
	}
	enabled, err := api.Zed.IsGuildDiscordBotEnabled(ctx, state.GuildID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !enabled || !api.Opts.Bot.Available() {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Discord integration is no longer available for this guild."})
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Discord did not return an authorization code."})
		return
	}

	form := url.Values{
		"client_id":     {api.Opts.Discord.ClientID},
		"client_secret": {api.Opts.Discord.ClientSecret},
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {api.discordInstallCallbackURL()},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, discordOAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{Message: "Discord rejected the installation request."})
		return
	}
	var tokenResponse discordInstallTokenResponse
	if err := json.NewDecoder(response.Body).Decode(&tokenResponse); err != nil || tokenResponse.Guild.ID == "" {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{Message: "Discord did not return the installed server."})
		return
	}
	verifiedGuild, err := api.Opts.Bot.VerifyGuild(tokenResponse.Guild.ID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{Message: "Chronicle could not verify the Discord server installation."})
		return
	}
	_, err = api.Zed.UpsertGuildDiscordInstallation(ctx, database.UpsertGuildDiscordInstallationParams{
		GuildID:          state.GuildID,
		DiscordGuildID:   verifiedGuild.ID,
		DiscordGuildName: verifiedGuild.Name,
		InstalledBy:      claims.Subject,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	http.Redirect(w, r, fmt.Sprintf("/g/%s/settings?tab=discord-integration", state.GuildID), http.StatusSeeOther)
}

// DeleteGuildDiscordInstallation unlinks Chronicle and removes the bot from Discord.
func (api *API) DeleteGuildDiscordInstallation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)
	installation, err := api.Zed.DeleteGuildDiscordInstallation(ctx, guild.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNoContent, nil)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	installationCount, err := api.Zed.CountGuildDiscordInstallationsByDiscordGuildID(ctx, installation.DiscordGuildID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if installationCount == 0 {
		if err := api.Opts.Bot.LeaveGuild(installation.DiscordGuildID); err != nil {
			api.Opts.Logger.Warn("failed to remove unlinked Discord bot", "discord_guild_id", installation.DiscordGuildID, "error", err)
		}
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
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

	// Add user as guild member (SpiceDB relation)
	err = api.Zed.AddGuildMember(ctx, guild.ID, found.UserID)
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
