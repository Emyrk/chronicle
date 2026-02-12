package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
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
	user, err := a.Opts.DB.GetUserByID(ctx, state.Claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.Session{
		UserID:               state.Claims.Subject,
		SessionID:            state.Claims.SessionID,
		Roles:                roles,
		MaxStorageBytes:      user.MaxStorageBytes.Int64,
		ConsumedStorageBytes: user.ConsumedStorageBytes,
	})
}
