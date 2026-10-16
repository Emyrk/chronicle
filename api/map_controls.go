package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5"
)

const maxMapControlBindings = 32

var (
	mapControlActionRegex = regexp.MustCompile(`^[a-z_]{1,32}$`)
	// KeyboardEvent.code values: "KeyW", "ArrowUp", "Numpad8", "BracketLeft".
	mapControlKeyRegex = regexp.MustCompile(`^[A-Za-z0-9]{1,32}$`)
)

func validateMapControls(controls chroniclesdk.MapControls) error {
	if len(controls.Bindings) > maxMapControlBindings {
		return fmt.Errorf("at most %d bindings", maxMapControlBindings)
	}
	for action, key := range controls.Bindings {
		if !mapControlActionRegex.MatchString(action) {
			return fmt.Errorf("invalid action %q", action)
		}
		if !mapControlKeyRegex.MatchString(key) {
			return fmt.Errorf("invalid key %q for %q", key, action)
		}
	}
	return nil
}

func mapControlsFromRow(row database.UserMapControl) (chroniclesdk.MapControls, error) {
	controls := chroniclesdk.MapControls{}
	if err := json.Unmarshal(row.Controls, &controls); err != nil {
		return chroniclesdk.MapControls{}, err
	}
	if controls.Bindings == nil {
		controls.Bindings = map[string]string{}
	}
	return controls, nil
}

func (a *API) GetMyMapControls(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	row, err := a.Opts.Zed.GetUserMapControls(ctx, claims.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.MapControls{Bindings: map[string]string{}})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	controls, err := mapControlsFromRow(row)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, controls)
}

func (a *API) UpdateMyMapControls(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	var req chroniclesdk.MapControls
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if req.Bindings == nil {
		req.Bindings = map[string]string{}
	}
	if err := validateMapControls(req); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid map controls.", Detail: err.Error()})
		return
	}
	payload, err := json.Marshal(req)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	row, err := a.Opts.Zed.UpsertUserMapControls(ctx, database.UpsertUserMapControlsParams{UserID: claims.Subject, Controls: payload})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	controls, err := mapControlsFromRow(row)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, controls)
}

// ResetMyMapControls drops the saved controls so the defaults apply.
func (a *API) ResetMyMapControls(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	if err := a.Opts.Zed.DeleteUserMapControls(ctx, claims.Subject); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.MapControls{Bindings: map[string]string{}})
}
