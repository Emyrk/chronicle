package api

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	maxUserTalentBuilds    = 25
	maxTalentBuildNameLen  = 64
	maxTalentBuildValueLen = 512
)

// validTalentBuildString accepts the positional build encoding used by the
// talent calculator: digit sections separated by dashes, e.g. "35003-05032".
// An empty build (no points spent) is allowed.
func validTalentBuildString(build string) bool {
	if build == "" {
		return true
	}
	if len(build) > maxTalentBuildValueLen {
		return false
	}
	for _, section := range strings.Split(build, "-") {
		for _, r := range section {
			if r < '0' || r > '9' {
				return false
			}
		}
	}
	return true
}

func validateTalentBuildName(name string) (string, bool) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", false
	}
	if len(name) > maxTalentBuildNameLen {
		return "", false
	}
	return name, true
}

// ListMyTalentBuilds lists the saved talent builds of the authenticated user.
func (api *API) ListMyTalentBuilds(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)

	// Builds are tenant-scoped: only show the ones saved on the current
	// tenant domain. uuid.Nil (the zero UUID) is the root domain.
	builds, err := api.Opts.Zed.ListUserTalentBuilds(ctx, database.ListUserTalentBuildsParams{
		UserID:   state.Claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ListUserTalentBuildsResponse{
		Builds: db2sdk.UserTalentBuilds(builds),
		Limit:  maxUserTalentBuilds,
	})
}

// CreateMyTalentBuild saves a new talent build for the authenticated user.
func (api *API) CreateMyTalentBuild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)
	userID := state.Claims.Subject

	var req chroniclesdk.CreateUserTalentBuildRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	name, ok := validateTalentBuildName(req.Name)
	if !ok {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("Name is required and must be at most %d characters", maxTalentBuildNameLen),
		})
		return
	}
	if !validTalentBuildString(req.Build) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Build must be a dash-separated digit string",
		})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	count, err := api.Opts.Zed.CountUserTalentBuilds(ctx, database.CountUserTalentBuildsParams{
		UserID:   userID,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count >= maxUserTalentBuilds {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: fmt.Sprintf("You can save at most %d talent builds. Delete one to save another.", maxUserTalentBuilds),
		})
		return
	}

	build, err := api.Opts.Zed.CreateUserTalentBuild(ctx, database.CreateUserTalentBuildParams{
		UserID:   userID,
		TenantID: tenantID,
		Name:     name,
		ClassID:  req.ClassID,
		Build:    req.Build,
		Locked:   req.Locked,
	})
	if err != nil {
		if database.IsUniqueViolation(err, database.UniqueUserTalentBuildsUserNameCiUidx) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "You already have a talent build with that name",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, db2sdk.UserTalentBuild(build))
}

// UpdateMyTalentBuild updates a saved talent build owned by the authenticated user.
func (api *API) UpdateMyTalentBuild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)

	buildID, err := uuid.Parse(chi.URLParam(r, "buildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid build ID"})
		return
	}

	var req chroniclesdk.UpdateUserTalentBuildRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	params := database.UpdateUserTalentBuildByIDParams{
		ID:       buildID,
		UserID:   state.Claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	}
	if req.Name != nil {
		name, ok := validateTalentBuildName(*req.Name)
		if !ok {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: fmt.Sprintf("Name is required and must be at most %d characters", maxTalentBuildNameLen),
			})
			return
		}
		params.Name = pgtype.Text{String: name, Valid: true}
	}
	if req.Build != nil {
		if !validTalentBuildString(*req.Build) {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Build must be a dash-separated digit string",
			})
			return
		}
		params.Build = pgtype.Text{String: *req.Build, Valid: true}
	}
	if req.Locked != nil {
		params.Locked = pgtype.Bool{Bool: *req.Locked, Valid: true}
	}

	// The query filters by both id and user_id, so a user can never update a
	// build they do not own — it reports not-found instead.
	updated, err := api.Opts.Zed.UpdateUserTalentBuildByID(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Talent build not found"})
			return
		}
		if database.IsUniqueViolation(err, database.UniqueUserTalentBuildsUserNameCiUidx) {
			httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
				Message: "You already have a talent build with that name",
			})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, db2sdk.UserTalentBuild(updated))
}

// DeleteMyTalentBuild deletes a saved talent build owned by the authenticated user.
func (api *API) DeleteMyTalentBuild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	state := chronauth.AuthenticationState(r)

	buildID, err := uuid.Parse(chi.URLParam(r, "buildID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid build ID"})
		return
	}

	deleted, err := api.Opts.Zed.DeleteUserTalentBuildByID(ctx, database.DeleteUserTalentBuildByIDParams{
		ID:       buildID,
		UserID:   state.Claims.Subject,
		TenantID: servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if deleted == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Talent build not found"})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Talent build deleted"})
}
