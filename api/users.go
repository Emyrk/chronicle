package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
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

	sess := chroniclesdk.Session{
		UserID:               state.Claims.Subject,
		SessionID:            state.Claims.SessionID,
		Roles:                roles,
		MaxStorageBytes:      user.MaxStorageBytes,
		ConsumedStorageBytes: user.ConsumedStorageBytes,
		Preferences:          userPreferences(user),
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

// UpdateMyPreferences updates the current user's preferences.
func (a *API) UpdateMyPreferences(w http.ResponseWriter, r *http.Request) {
	state := chronauth.AuthenticationState(r)
	ctx := r.Context()

	var req chroniclesdk.UpdatePreferencesRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if req.RawLogRetentionHours != nil {
		val := *req.RawLogRetentionHours
		var retentionHours pgtype.Int4
		if val > 0 {
			retentionHours = pgtype.Int4{Int32: val, Valid: true}
		}
		// val == 0 means "keep forever" → NULL in DB (retentionHours.Valid stays false)

		_, err := a.Opts.Zed.UpdateUserRawLogRetentionHours(ctx, database.UpdateUserRawLogRetentionHoursParams{
			ID:                   state.Claims.Subject,
			RawLogRetentionHours: retentionHours,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	// Return updated preferences.
	user, err := a.Opts.Zed.GetUserByID(ctx, state.Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, userPreferences(user))
}

// userPreferences converts a database user to SDK preferences.
func userPreferences(user database.ChronicleUser) chroniclesdk.Preferences {
	prefs := chroniclesdk.Preferences{
		// Should allow people to disable hints if they want, but for now we'll just enable them by default
		HelpfulHints: true,
	}
	if user.RawLogRetentionHours.Valid {
		v := user.RawLogRetentionHours.Int32
		prefs.RawLogRetentionHours = &v
	}
	return prefs
}
