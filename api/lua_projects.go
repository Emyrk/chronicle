package api

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

var luaProjectSlug = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func luaProjectResponse(p database.LuaProject, private bool) chroniclesdk.LuaProject {
	result := chroniclesdk.LuaProject{ID: p.ID, OwnerID: p.OwnerID, Kind: p.Kind, Name: p.Name, Slug: p.Slug, Revision: p.Revision, CreatedAt: p.CreatedAt.Time, UpdatedAt: p.UpdatedAt.Time}
	if private && p.DraftHash.Valid {
		result.DraftSHA256 = p.DraftHash.String
	}
	if p.UnstableHash.Valid {
		result.Unstable = &chroniclesdk.LuaProjectChannel{SHA256: p.UnstableHash.String, PublishedAt: p.UnstablePublishedAt.Time, PublishedBy: p.UnstablePublishedBy.UUID}
	}
	if p.StableHash.Valid {
		result.Stable = &chroniclesdk.LuaProjectChannel{SHA256: p.StableHash.String, PublishedAt: p.StablePublishedAt.Time, PublishedBy: p.StablePublishedBy.UUID}
	}
	return result
}

func luaProjectID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "projectID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid project ID."})
		return uuid.Nil, false
	}
	return id, true
}

// canLuaProject checks the project object in SpiceDB. Public reads use a
// wildcard-matching user subject even when the request has no session.
func (a *API) canLuaProject(w http.ResponseWriter, r *http.Request, id uuid.UUID, update bool) bool {
	actor, authenticated := authz.ActorFromContext(r.Context())
	if !authenticated {
		if update {
			httpapi.Forbidden(w, nil)
			return false
		}
		actor = policy.New().User(uuid.Nil)
	}
	project := policy.New().Lua_project(id)
	var allowed bool
	var err error
	if update {
		allowed, err = a.Opts.Zed.CheckOne(r.Context(), nil, project.CanUpdate_User(actor))
	} else {
		allowed, err = a.Opts.Zed.CheckOne(r.Context(), nil, project.CanView_User(actor))
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return false
	}
	if !allowed {
		httpapi.Forbidden(w, nil)
		return false
	}
	return true
}

func (a *API) CreateLuaProject(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req chroniclesdk.CreateLuaProjectRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if (req.Kind != "panel" && req.Kind != "guide") || len(req.Name) < 1 || len(req.Name) > 120 || strings.TrimSpace(req.Name) != req.Name || len(req.Slug) > 80 || !luaProjectSlug.MatchString(req.Slug) {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid project name, kind or slug."})
		return
	}
	var p database.LuaProject
	err := a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		p, err = tx.CreateLuaProject(r.Context(), database.CreateLuaProjectParams{OwnerID: chronauth.MustAuthenticatedClaims(r.Context()).Subject, Kind: req.Kind, Name: req.Name, Slug: req.Slug})
		return err
	}, nil)
	if err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23505" {
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Project slug already exists."})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusCreated, luaProjectResponse(p, true))
}

func (a *API) ListMyLuaProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.Opts.Zed.ListOwnerLuaProjects(r.Context(), chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := make([]chroniclesdk.LuaProject, 0, len(projects))
	for _, p := range projects {
		out = append(out, luaProjectResponse(p, true))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}

func (a *API) GetMyLuaProject(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, false) {
		return
	}
	p, err := a.Opts.Zed.GetOwnerLuaProject(r.Context(), database.GetOwnerLuaProjectParams{ID: id, OwnerID: chronauth.MustAuthenticatedClaims(r.Context()).Subject})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Project not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, luaProjectResponse(p, true))
}

func (a *API) PutLuaProjectDraft(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, true) {
		return
	}
	revision, err := strconv.ParseInt(r.URL.Query().Get("expected_revision"), 10, 64)
	if err != nil || revision < 1 || r.Header.Get("Content-Type") != "application/x-tar" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Expected revision and application/x-tar required."})
		return
	}
	owner := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	current, err := a.Opts.Zed.GetOwnerLuaProject(r.Context(), database.GetOwnerLuaProjectParams{ID: id, OwnerID: owner})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Project not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	archive, err := canonicalLuaZIP(r.Body, current.Kind, current.Name, current.Slug)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid tar package.", Detail: err.Error()})
		return
	}
	hash := sha256.Sum256(archive)
	digest := hex.EncodeToString(hash[:])
	var project database.LuaProject
	err = a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		project, err = tx.SetLuaProjectDraft(r.Context(), database.SetLuaProjectDraftParams{ID: id, OwnerID: owner, Hash: pgtype.Text{String: digest, Valid: true}, ExpectedRevision: revision})
		if err != nil {
			return err
		}
		if err = tx.PutLuaProjectArtifact(r.Context(), database.PutLuaProjectArtifactParams{ProjectID: id, Hash: digest, Bytes: archive}); err != nil {
			return err
		}
		return tx.PruneLuaProjectArtifacts(r.Context(), database.PruneLuaProjectArtifactsParams{ID: id, OwnerID: owner})
	}, nil)
	luaProjectMutationResult(w, r, project, err)
}

func (a *API) PublishLuaProject(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, true) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req chroniclesdk.LuaProjectPublishRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	channel := chi.URLParam(r, "channel")
	if req.ExpectedRevision < 1 || (channel == "stable" && (len(req.TestedSHA256) != 64 || !isLowerHex(req.TestedSHA256))) {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid revision or tested unstable SHA-256."})
		return
	}
	owner := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	var project database.LuaProject
	err := a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		if channel == "stable" {
			project, err = tx.PromoteLuaProjectStable(r.Context(), database.PromoteLuaProjectStableParams{ID: id, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: req.ExpectedRevision, TestedSha256: pgtype.Text{String: req.TestedSHA256, Valid: true}})
		} else {
			project, err = tx.PublishLuaProjectUnstable(r.Context(), database.PublishLuaProjectUnstableParams{ID: id, OwnerID: uuid.NullUUID{UUID: owner, Valid: true}, ExpectedRevision: req.ExpectedRevision})
		}
		if err != nil {
			return err
		}
		return tx.PruneLuaProjectArtifacts(r.Context(), database.PruneLuaProjectArtifactsParams{ID: id, OwnerID: owner})
	}, nil)
	luaProjectMutationResult(w, r, project, err)
}

func isLowerHex(s string) bool {
	_, err := hex.DecodeString(s)
	return err == nil && strings.ToLower(s) == s
}

func luaProjectMutationResult(w http.ResponseWriter, r *http.Request, p database.LuaProject, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Project missing, revision changed, or publication prerequisites unmet."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, luaProjectResponse(p, true))
}

func (a *API) ListPublicLuaProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.Opts.Zed.ListPublicLuaProjects(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := make([]chroniclesdk.LuaProject, 0, len(projects))
	actor, ok := authz.ActorFromContext(r.Context())
	if !ok {
		actor = policy.New().User(uuid.Nil)
	}
	for _, p := range projects {
		allowed, err := a.Opts.Zed.CheckOne(r.Context(), nil, policy.New().Lua_project(p.ID).CanView_User(actor))
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if !allowed {
			continue
		}
		item := luaProjectResponse(p, false)
		item.Unstable = nil // Unstable releases are discoverable only through their project link.
		out = append(out, item)
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}

func (a *API) publicLuaProject(w http.ResponseWriter, r *http.Request) (database.LuaProject, string, bool) {
	id, ok := luaProjectID(w, r)
	if !ok {
		return database.LuaProject{}, "", false
	}
	channel := r.URL.Query().Get("channel")
	if channel == "" {
		channel = "stable"
	}
	if channel != "stable" && channel != "unstable" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid channel."})
		return database.LuaProject{}, "", false
	}
	p, err := a.Opts.Zed.GetPublicLuaProject(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Project not found."})
		return database.LuaProject{}, "", false
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return database.LuaProject{}, "", false
	}
	if channel == "stable" && !p.StableHash.Valid || channel == "unstable" && !p.UnstableHash.Valid {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Channel not published."})
		return database.LuaProject{}, "", false
	}
	if !a.canLuaProject(w, r, id, false) {
		return database.LuaProject{}, "", false
	}
	return p, channel, true
}

func (a *API) GetPublicLuaProject(w http.ResponseWriter, r *http.Request) {
	p, channel, ok := a.publicLuaProject(w, r)
	if !ok {
		return
	}
	result := luaProjectResponse(p, false)
	if channel == "stable" {
		result.Unstable = nil
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}

func (a *API) DownloadMyLuaProjectDraft(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, true) {
		return
	}
	owner := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	result, err := a.Opts.Zed.GetOwnerLuaProjectDraftPackage(r.Context(), database.GetOwnerLuaProjectDraftPackageParams{ID: id, OwnerID: owner})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Draft package not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("ETag", `"`+result.LuaProject.DraftHash.String+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Bytes)
}

func (a *API) DownloadLuaProject(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok {
		return
	}
	channel := r.URL.Query().Get("channel")
	if channel == "" {
		channel = "stable"
	}
	if channel != "stable" && channel != "unstable" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid channel."})
		return
	}
	result, err := a.Opts.Zed.GetPublishedLuaProjectPackage(r.Context(), database.GetPublishedLuaProjectPackageParams{ID: id, Channel: channel})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Channel not published."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !a.canLuaProject(w, r, id, false) {
		return
	}
	hash := result.LuaProject.StableHash.String
	if channel == "unstable" {
		hash = result.LuaProject.UnstableHash.String
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, result.LuaProject.Slug))
	w.Header().Set("ETag", `"`+hash+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Bytes)
}
