package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chronicle"
)

const maxWoWLogsTokenLength = 512

// GetMyWoWLogsSettings reports whether the caller has a wow-logs token saved.
func (a *API) GetMyWoWLogsSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.AuthenticationState(r).Claims.Subject

	updatedAt, err := a.Opts.Chronicle.UserWoWLogsTokenUpdatedAt(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WoWLogsSettings{
		Available:      a.Opts.Chronicle.CredentialsAvailable(),
		TokenSet:       updatedAt != nil,
		TokenUpdatedAt: updatedAt,
	})
}

// SetMyWoWLogsToken saves the caller's own wow-logs token, opting their
// uploads into forwarding on tenants that support it.
func (a *API) SetMyWoWLogsToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.AuthenticationState(r).Claims.Subject

	var req chroniclesdk.SetWoWLogsTokenRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" || len(token) > maxWoWLogsTokenLength {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Token must be between 1 and 512 characters",
		})
		return
	}

	err := a.Opts.Chronicle.SetUserWoWLogsToken(ctx, userID, token)
	if errors.Is(err, chronicle.ErrCredentialsDisabled) {
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{
			Message: "Token storage is not configured on this server",
		})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.GetMyWoWLogsSettings(w, r)
}

// DeleteMyWoWLogsToken removes the caller's token, opting them out.
func (a *API) DeleteMyWoWLogsToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.AuthenticationState(r).Claims.Subject

	if err := a.Opts.Chronicle.DeleteUserWoWLogsToken(ctx, userID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.GetMyWoWLogsSettings(w, r)
}
