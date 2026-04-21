package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
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
		Preferences: chroniclesdk.Preferences{
			// Should allow people to disable hints if they want, but for now we'll just enable them by default
			HelpfulHints: true,
		},
		Email:        user.Email,
		AuthProvider: state.Claims.Provider,
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

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.UserStorageInfo{
		MaxStorageBytes:      user.MaxStorageBytes,
		ConsumedStorageBytes: user.ConsumedStorageBytes,
		Grants:               db2sdk.DataGrants(grants),
	})
}
