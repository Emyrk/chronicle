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
	"github.com/jackc/pgx/v5/pgtype"
)

func (a *API) WhoAmI(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims, authenticated := chronauth.AuthenticatedClaims(ctx)
	if !authenticated {
		state := chronauth.AuthenticationState(r)
		if state == nil || state.Error == nil || state.Error == chronauth.ErrNotAuthorized {
			httpapi.Write(ctx, w, http.StatusNoContent, nil)
			return
		}
		if errors.Is(state.Error, chronauth.ErrNotAuthorized) {
			httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Invalid session token"})
			return
		}
		httpapi.InternalServerError(w, state.Error)
		return
	}

	roles, err := a.Zed.UserChronicleRoles(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// Fetch user storage info
	user, err := a.Opts.Zed.GetUserByID(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	actor := policy.New().User(claims.Subject)
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
		UserID:               claims.Subject,
		SessionID:            claims.SessionID,
		Roles:                roles,
		MaxStorageBytes:      user.MaxStorageBytes,
		ConsumedStorageBytes: user.ConsumedStorageBytes,
		Preferences:          userPreferences(user),
		CanDownloadRawLogs:   canDownloadRawLogs,
		AdsFree:              adsFree,
		Email:                user.Email,
		AuthProvider:         claims.Provider,
		CreatedAt:            user.CreatedAt.Time,
	}

	// For password-auth users, look up email verification status
	if claims.Provider == chronauth.PasswordProvider {
		pw, err := a.Opts.Zed.GetUserPasswordByAuthID(ctx, claims.UserAuthID)
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

	if req.CharacterCosmetics != nil && !req.CharacterCosmetics.IsValid() {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid character cosmetics display mode",
		})
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

	if req.CharacterCosmetics != nil {
		_, err := a.Opts.Zed.UpdateUserCharacterCosmeticsDisplayMode(ctx, database.UpdateUserCharacterCosmeticsDisplayModeParams{
			ID:                 state.Claims.Subject,
			CharacterCosmetics: string(*req.CharacterCosmetics),
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
		HelpfulHints:       true,
		CharacterCosmetics: chroniclesdk.CharacterCosmeticsDisplayMode(user.CharacterCosmetics),
	}
	if user.RawLogRetentionHours.Valid {
		v := user.RawLogRetentionHours.Int32
		prefs.RawLogRetentionHours = &v
	}
	return prefs
}
