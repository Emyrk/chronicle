package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
)

func (a *API) WhoAmI(w http.ResponseWriter, r *http.Request) {
	state := chronauth.AuthenticationState(r)
	ctx := r.Context()
	roles, err := a.Zed.UserChronicleRoles(ctx, state.Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Fetch user storage info
	user, err := a.Opts.Zed.GetUserByID(ctx, state.Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	actor := policy.New().User(state.Claims.Subject)
	chronicle := policy.New().GlobalChronicle()
	permissions, err := a.Zed.Check(ctx, nil,
		chronicle.CanAd_free_User(actor),
		chronicle.CanDownload_raw_logs_User(actor),
	)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if len(permissions) != 2 {
		httpapi.InternalServerError(w, fmt.Errorf("check whoami permissions: expected 2 results, got %d", len(permissions)))
		return
	}
	adsFree := permissions[0]
	canDownloadRawLogs := permissions[1]

	sess := chroniclesdk.Session{
		UserID:               state.Claims.Subject,
		SessionID:            state.Claims.SessionID,
		Roles:                roles,
		MaxStorageBytes:      user.MaxStorageBytes,
		ConsumedStorageBytes: user.ConsumedStorageBytes,
		Preferences:          userPreferences(user),
		CanDownloadRawLogs:   canDownloadRawLogs,
		AdsFree:              adsFree,
		Email:                user.Email,
		AuthProvider:         state.Claims.Provider,
		CreatedAt:            user.CreatedAt.Time,
	}

	// For password-auth users, look up email verification status
	if state.Claims.Provider == chronauth.PasswordProvider {
		pw, err := a.Opts.Zed.GetUserPasswordByAuthID(ctx, state.Claims.UserAuthID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			httpapi.InternalServerError(w, err)
			return
		}
		if err == nil {
			sess.EmailVerified = pw.EmailVerified
		}
	}

	httpapi.Write(r.Context(), w, http.StatusOK, sess)
}

// DumpToken returns the caller's raw session JWT so it can be used as a Bearer
// token for CLI / programmatic access (e.g. the dbcdata import command).
//
// CSRF protection: a custom request header (X-Chronicle-Token-Dump) is
// required. Browsers cannot set custom headers on cross-site requests without
// a CORS preflight, which this same-origin-only endpoint never grants — so a
// malicious site cannot ride the user's cookie to steal the token.
func (a *API) DumpToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.Header.Get("X-Chronicle-Token-Dump") == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Missing required X-Chronicle-Token-Dump header",
		})
		return
	}

	token, err := a.Auth.RawSessionJWT(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{
			Message: "No session token available",
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TokenDumpResponse{Token: token})
}

// GetMyStorage returns the current user's storage info with grant breakdown
func (a *API) GetMyStorage(w http.ResponseWriter, r *http.Request) {
	state := chronauth.AuthenticationState(r)
	ctx := r.Context()
	userID := state.Claims.Subject

	user, err := a.Opts.Zed.GetUserByID(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	grants, err := a.Opts.Zed.GetUserDataGrants(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	parsed, err := a.Opts.Zed.GetParsedBytesByOwner(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.UserStorageInfo{
		MaxStorageBytes:      user.MaxStorageBytes,
		ConsumedStorageBytes: user.ConsumedStorageBytes,
		Grants:               db2sdk.DataGrants(grants),
		ParsedStorageBytes:   parsed.ParsedBytes,
		ParsedInstanceCount:  parsed.ParsedInstanceCount,
	})
}

// userPreferences converts a database user to SDK preferences.
func userPreferences(_ database.ChronicleUser) chroniclesdk.Preferences {
	return chroniclesdk.Preferences{
		// Should allow people to disable hints if they want, but for now we'll just enable them by default
		HelpfulHints: true,
	}
}
