package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

const luaProjectBucket = "lua-projects"

// Object keys are unique per upload attempt. A concurrent re-upload of the
// same digest cannot be deleted by cleanup of an older artifact row.
func luaProjectObjectKey(id uuid.UUID) string {
	return id.String() + "/" + uuid.NewString() + ".zip"
}

// Count only keys that are eligible now and have no committed artifact.
// Claim leases do not remove work from the backlog until deletion succeeds.
func (a *API) refreshLuaArtifactBacklog(ctx context.Context) {
	if a.luaArtifactBacklog == nil {
		return
	}
	count, err := a.Opts.Zed.CountReadyLuaProjectArtifactGarbage(ctx)
	if err != nil {
		a.Opts.Logger.Error("count Lua ZIP garbage backlog", "error", err)
		return
	}
	a.luaArtifactBacklog.Set(float64(count))
}

// A garbage row is committed with each pruned artifact. Upload intents are
// recorded before object I/O. Only unreferenced, eligible keys are claimed
// for deletion, retried on writes and by the periodic service collector.
func (a *API) drainLuaArtifactGarbage(ctx context.Context) {
	a.drainLuaArtifactGarbageAt(ctx, time.Time{}) // PostgreSQL supplies now().
}

// A nonzero cutoff is only for deterministic tests of expiry and retries.
func (a *API) drainLuaArtifactGarbageAt(ctx context.Context, asOf time.Time) {
	if a.Opts.Zed == nil {
		return
	}
	a.refreshLuaArtifactBacklog(ctx)
	if a.Opts.Storage == nil {
		return
	}
	keys, err := a.Opts.Zed.ClaimLuaProjectArtifactGarbage(ctx, pgtype.Timestamptz{Time: asOf, Valid: !asOf.IsZero()})
	if err != nil {
		a.Opts.Logger.Error("list Lua ZIP garbage", "error", err)
		return
	}
	for _, key := range keys {
		if ctx.Err() != nil {
			return
		}
		if _, err := a.Opts.Storage.RemoveFile(ctx, luaProjectBucket, []string{key}); err != nil {
			a.Opts.Logger.Error("remove Lua ZIP garbage", "key", key, "error", err)
			continue
		}
		if err := a.Opts.Zed.DeleteLuaProjectArtifactGarbage(ctx, key); err != nil {
			a.Opts.Logger.Error("acknowledge Lua ZIP garbage", "key", key, "error", err)
		}
	}
}

func (a *API) drainLuaArtifactGarbageAfterWrite() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	a.drainLuaArtifactGarbage(ctx)
}

func (a *API) luaZIP(w http.ResponseWriter, r *http.Request, key, digest, mimeType string, encoding pgtype.Text) ([]byte, bool) {
	if mimeType != "application/zip" || encoding.Valid {
		httpapi.InternalServerError(w, fmt.Errorf("unsupported Lua artifact format: %q, encoding %q", mimeType, encoding.String))
		return nil, false
	}
	if a.Opts.Storage == nil {
		httpapi.InternalServerError(w, errors.New("lua project object storage is unavailable"))
		return nil, false
	}
	archive, err := a.Opts.Storage.DownloadFile(r.Context(), luaProjectBucket, key)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return nil, false
	}
	hash := sha256.Sum256(archive)
	if hex.EncodeToString(hash[:]) != digest {
		httpapi.InternalServerError(w, fmt.Errorf("lua ZIP digest mismatch: %s", key))
		return nil, false
	}
	return archive, true
}

var luaProjectSlug = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// reservedLuaProjectSlugs would collide with /addons/<author>/<slug> sub-routes.
var reservedLuaProjectSlugs = map[string]bool{"edit": true, "new": true, "api": true}

// luaReleasesWithFiles is how many of an addon's newest releases keep their packages.
const luaReleasesWithFiles = 3

// luaReleaseTag matches the lua_project_releases tag check.
var luaReleaseTag = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`)

// luaProjectResponse builds the API project; authors maps the owner and release publishers to their author names.
func luaProjectResponse(p database.LuaProject, releases []database.LuaProjectRelease, authors map[uuid.UUID]string) chroniclesdk.LuaProject {
	result := chroniclesdk.LuaProject{ID: p.ID, OwnerID: p.OwnerID, Kind: p.Kind, Name: p.Name, Slug: p.Slug, Revision: p.Revision,
		Author: authors[p.OwnerID], Releases: make([]chroniclesdk.LuaProjectRelease, 0, len(releases)), CreatedAt: p.CreatedAt.Time, UpdatedAt: p.UpdatedAt.Time}
	if p.DraftHash.Valid {
		result.Main = &chroniclesdk.LuaProjectMain{SHA256: p.DraftHash.String, Icon: p.DraftIcon.String, UpdatedAt: p.UpdatedAt.Time}
	}
	for _, release := range releases {
		item := chroniclesdk.LuaProjectRelease{Tag: release.Tag, SHA256: release.Hash.String, Available: release.Hash.Valid, Icon: release.Icon.String, PublishedAt: release.PublishedAt.Time}
		if release.PublishedBy.Valid {
			item.PublishedBy = &release.PublishedBy.UUID
			item.PublishedByAuthor = authors[release.PublishedBy.UUID]
		}
		result.Releases = append(result.Releases, item)
	}
	return result
}

// luaProjectResponses loads releases and author names for several projects at once.
func (a *API) luaProjectResponses(ctx context.Context, projects ...database.LuaProject) ([]chroniclesdk.LuaProject, error) {
	ids := make([]uuid.UUID, 0, len(projects))
	for _, p := range projects {
		ids = append(ids, p.ID)
	}
	releases := map[uuid.UUID][]database.LuaProjectRelease{}
	if len(ids) > 0 {
		rows, err := a.Opts.Zed.ListLuaProjectReleasesForProjects(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			releases[row.ProjectID] = append(releases[row.ProjectID], row)
		}
	}
	users := make([]uuid.UUID, 0, len(projects))
	add := func(id uuid.UUID) {
		if !slices.Contains(users, id) {
			users = append(users, id)
		}
	}
	for _, p := range projects {
		add(p.OwnerID)
		for _, release := range releases[p.ID] {
			if release.PublishedBy.Valid {
				add(release.PublishedBy.UUID)
			}
		}
	}
	authors, err := a.addonAuthorNames(ctx, users)
	if err != nil {
		return nil, err
	}
	out := make([]chroniclesdk.LuaProject, 0, len(projects))
	for _, p := range projects {
		out = append(out, luaProjectResponse(p, releases[p.ID], authors))
	}
	return out, nil
}

func (a *API) writeLuaProject(w http.ResponseWriter, r *http.Request, status int, p database.LuaProject) {
	out, err := a.luaProjectResponses(r.Context(), p)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, status, out[0])
}

func luaProjectID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "projectID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid project ID."})
		return uuid.Nil, false
	}
	return id, true
}

var luaArtifactHash = regexp.MustCompile(`^[0-9a-f]{64}$`)

func luaProjectHash(w http.ResponseWriter, r *http.Request) (string, bool) {
	hash := chi.URLParam(r, "hash")
	if !luaArtifactHash.MatchString(hash) {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid artifact hash."})
		return "", false
	}
	return hash, true
}

// luaPermission names a lua_project permission in SpiceDB.
type luaPermission string

const (
	luaView    luaPermission = "view"
	luaUse     luaPermission = "use"
	luaEdit    luaPermission = "edit"
	luaRelease luaPermission = "release"
	luaManage  luaPermission = "manage"
)

var luaPermissions = []luaPermission{luaView, luaUse, luaEdit, luaRelease, luaManage}

func luaProjectCheck(project *policy.ObjLua_project, permission luaPermission, actor *policy.ObjUser) rel.Interface {
	switch permission {
	case luaUse:
		return project.CanUse_User(actor)
	case luaEdit:
		return project.CanEdit_User(actor)
	case luaRelease:
		return project.CanRelease_User(actor)
	case luaManage:
		return project.CanManage_User(actor)
	default:
		return project.CanView_User(actor)
	}
}

// luaActor is the request's user, or a subject that matches only user:* grants when signed out.
func luaActor(r *http.Request) (*policy.ObjUser, bool) {
	actor, authenticated := authz.ActorFromContext(r.Context())
	if !authenticated {
		return policy.New().User(uuid.Nil), false
	}
	return actor, true
}

// canLuaProject checks one project permission in SpiceDB and writes a 403 when it is missing. Only view
// and use can be granted to signed-out visitors. SQL queries no longer filter by owner: this is the check.
func (a *API) canLuaProject(w http.ResponseWriter, r *http.Request, id uuid.UUID, permission luaPermission) bool {
	actor, authenticated := luaActor(r)
	if !authenticated && permission != luaView && permission != luaUse {
		httpapi.Forbidden(w, nil)
		return false
	}
	allowed, err := a.Opts.Zed.CheckOne(r.Context(), nil, luaProjectCheck(policy.New().Lua_project(id), permission, actor))
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

// canLuaProjectViewOrUse gates a published package: viewers read its source and users run it.
func (a *API) canLuaProjectViewOrUse(w http.ResponseWriter, r *http.Request, id uuid.UUID) bool {
	actor, _ := luaActor(r)
	project := policy.New().Lua_project(id)
	results, err := a.Opts.Zed.Check(r.Context(), nil, project.CanView_User(actor), project.CanUse_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return false
	}
	if !results[0] && !results[1] {
		httpapi.Forbidden(w, nil)
		return false
	}
	return true
}

// luaProjectPermissions reports every project permission the request's user holds.
func (a *API) luaProjectPermissions(r *http.Request, id uuid.UUID) (chroniclesdk.LuaProjectPermissions, error) {
	actor, _ := luaActor(r)
	project := policy.New().Lua_project(id)
	checks := make([]rel.Interface, 0, len(luaPermissions))
	for _, permission := range luaPermissions {
		checks = append(checks, luaProjectCheck(project, permission, actor))
	}
	results, err := a.Opts.Zed.Check(r.Context(), nil, checks...)
	if err != nil {
		return chroniclesdk.LuaProjectPermissions{}, err
	}
	return chroniclesdk.LuaProjectPermissions{
		View: results[0], Use: results[1], Edit: results[2], Release: results[3], Manage: results[4],
	}, nil
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
	owner := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	author, err := a.Opts.Zed.GetAddonAuthorByUser(r.Context(), owner)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Claim an author name first; it is part of every addon's address."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if reservedLuaProjectSlugs[req.Slug] {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "That address is reserved; choose another slug."})
		return
	}
	var p database.LuaProject
	err = a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		p, err = tx.CreateLuaProject(r.Context(), database.CreateLuaProjectParams{OwnerID: owner, Kind: req.Kind, Name: req.Name, Slug: req.Slug})
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
	_ = author // Checked above; the response loads it with the project.
	a.writeLuaProject(w, r, http.StatusCreated, p)
}

func (a *API) ListMyLuaProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.Opts.Zed.ListUserLuaProjects(r.Context(), chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out, err := a.luaProjectResponses(r.Context(), projects...)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}

func (a *API) GetMyLuaProject(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	// The Workshop's view; the addon page uses GetLuaProjectPage.
	if !ok || !a.canLuaProject(w, r, id, luaEdit) {
		return
	}
	p, err := a.Opts.Zed.GetLuaProject(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Project not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProject(w, r, http.StatusOK, p)
}

func (a *API) PutLuaProjectDraft(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaEdit) {
		return
	}
	revision, err := strconv.ParseInt(r.URL.Query().Get("expected_revision"), 10, 64)
	if err != nil || revision < 1 || r.Header.Get("Content-Type") != "application/x-tar" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Expected revision and application/x-tar required."})
		return
	}
	current, err := a.Opts.Zed.GetLuaProject(r.Context(), id)
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
	uncompressedSize, err := luaZIPFileBytes(archive)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	icon, err := luaPackageIcon(archive)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	hash := sha256.Sum256(archive)
	digest := hex.EncodeToString(hash[:])
	if a.Opts.Storage == nil {
		httpapi.InternalServerError(w, errors.New("lua project object storage is unavailable"))
		return
	}
	// Commit the prospective key before object I/O, so crashes and failed
	// best-effort deletes leave a recoverable record. GC cannot claim it until
	// after the bounded upload window, and finalization must consume that record.
	key := luaProjectObjectKey(id)
	if err := a.Opts.Zed.RegisterLuaProjectUpload(r.Context(), key); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	contentType := "application/zip"
	uploadCtx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	if _, err := a.Opts.Storage.UploadFile(uploadCtx, luaProjectBucket, key, bytes.NewReader(archive), storage.FileOptions{ContentType: &contentType}); err != nil {
		// A timeout does not prove the object write failed. Keep the intent for
		// GC after its grace period instead of racing an in-flight PutObject.
		httpapi.InternalServerError(w, err)
		return
	}
	var project database.LuaProject
	var storedKey string
	err = a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		project, err = tx.SetLuaProjectDraft(r.Context(), database.SetLuaProjectDraftParams{ID: id, Hash: pgtype.Text{String: digest, Valid: true}, Icon: pgtype.Text{String: icon, Valid: icon != ""}, ExpectedRevision: revision})
		if err != nil {
			return err
		}
		storedKey, err = tx.PutLuaProjectArtifact(r.Context(), database.PutLuaProjectArtifactParams{
			ProjectID: id, Hash: digest, ObjectKey: key, MimeType: "application/zip",
			UncompressedSizeBytes: uncompressedSize,
			StoredSizeBytes:       int64(len(archive)),
		})
		if err != nil {
			return err
		}
		if err := tx.PruneLuaProjectArtifacts(r.Context(), id); err != nil {
			return err
		}
		if storedKey == key {
			_, err = tx.ConsumeLuaProjectUpload(r.Context(), key)
			return err // Roll back the artifact if GC has already claimed the key.
		}
		return nil // Existing identical bytes keep their prior object key.
	}, nil)
	// An error from COMMIT can mean the transaction actually committed. Never
	// delete this key on an uncertain result: committed artifacts consumed the
	// intent, while failed or duplicate uploads remain eligible for GC.
	if err == nil {
		a.drainLuaArtifactGarbageAfterWrite()
	}
	a.luaProjectMutationResult(w, r, project, err)
}

// CreateLuaProjectRelease tags the current main. Only the newest few releases keep their files.
func (a *API) CreateLuaProjectRelease(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaRelease) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req chroniclesdk.CreateLuaProjectReleaseRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	// "main" names the unreleased build in addon links, so it cannot be a tag.
	if req.ExpectedRevision < 1 || !luaReleaseTag.MatchString(req.Tag) || strings.EqualFold(req.Tag, "main") {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Tags are up to 32 letters, digits, dots, dashes and underscores, starting with a letter or digit, and cannot be \"main\"."})
		return
	}
	actor := chronauth.MustAuthenticatedClaims(r.Context()).Subject
	err := a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		if _, err := tx.CreateLuaProjectRelease(r.Context(), database.CreateLuaProjectReleaseParams{ID: id, Tag: req.Tag, ActorID: uuid.NullUUID{UUID: actor, Valid: true}, ExpectedRevision: req.ExpectedRevision}); err != nil {
			return err
		}
		if err := tx.TrimLuaProjectReleaseFiles(r.Context(), database.TrimLuaProjectReleaseFilesParams{ProjectID: id, Keep: luaReleasesWithFiles}); err != nil {
			return err
		}
		return tx.PruneLuaProjectArtifacts(r.Context(), id)
	}, nil)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "That tag already exists."})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Nothing saved to release yet, or the addon changed. Reload and try again."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.drainLuaArtifactGarbageAfterWrite()
	a.writeLuaProjectByID(w, r, id)
}

// DeleteLuaProjectRelease removes a release and, if it still had files, its package.
func (a *API) DeleteLuaProjectRelease(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaRelease) {
		return
	}
	var removed int64
	err := a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		if removed, err = tx.DeleteLuaProjectRelease(r.Context(), database.DeleteLuaProjectReleaseParams{ProjectID: id, Tag: chi.URLParam(r, "tag")}); err != nil {
			return err
		}
		return tx.PruneLuaProjectArtifacts(r.Context(), id)
	}, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if removed == 0 {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Release not found."})
		return
	}
	a.drainLuaArtifactGarbageAfterWrite()
	a.writeLuaProjectByID(w, r, id)
}

func (a *API) writeLuaProjectByID(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	p, err := a.Opts.Zed.GetLuaProject(r.Context(), id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProject(w, r, http.StatusOK, p)
}

func (a *API) luaProjectMutationResult(w http.ResponseWriter, r *http.Request, p database.LuaProject, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Project missing, revision changed, or publication prerequisites unmet."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProject(w, r, http.StatusOK, p)
}

func (a *API) ListPublicLuaProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := a.Opts.Zed.ListPublicLuaProjects(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	allowedProjects := make([]database.LuaProject, 0, len(projects))
	actor, ok := authz.ActorFromContext(r.Context())
	if !ok {
		actor = policy.New().User(uuid.Nil)
	}
	for _, p := range projects {
		allowed, err := a.Opts.Zed.CheckOne(r.Context(), nil, policy.New().Lua_project(p.ID).CanUse_User(actor))
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if !allowed {
			continue
		}
		allowedProjects = append(allowedProjects, p)
	}
	out, err := a.luaProjectResponses(r.Context(), allowedProjects...)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}

// GetPublicLuaProject is what panels poll to find the build to run: the latest release, or main.
// ?channel=stable and ?channel=unstable are kept for saved layouts and mean release and main.
func (a *API) GetPublicLuaProject(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok {
		return
	}
	channel := r.URL.Query().Get("channel")
	switch channel {
	case "", "stable":
		channel = "release"
	case "unstable":
		channel = "main"
	}
	if channel != "release" && channel != "main" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid channel."})
		return
	}
	p, err := a.Opts.Zed.GetPublicLuaProject(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Project not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// Panels resolve a channel to run it.
	if !a.canLuaProject(w, r, id, luaUse) {
		return
	}
	out, err := a.luaProjectResponses(r.Context(), p)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if channel == "main" && out[0].Main == nil || channel == "release" && !slices.ContainsFunc(out[0].Releases, func(release chroniclesdk.LuaProjectRelease) bool { return release.Available }) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Nothing published on this channel."})
		return
	}
	// The latest release and main move; resolve the current hash on every poll.
	w.Header().Set("Cache-Control", "no-store")
	httpapi.Write(r.Context(), w, http.StatusOK, out[0])
}

func (a *API) DownloadMyLuaProjectDraft(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok {
		return
	}
	hash, ok := luaProjectHash(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaEdit) {
		return
	}
	result, err := a.Opts.Zed.GetLuaProjectDraftPackage(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Draft package not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if result.LuaProject.DraftHash.String != hash {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Draft artifact not found."})
		return
	}
	archive, ok := a.luaZIP(w, r, result.ObjectKey, result.LuaProject.DraftHash.String, result.MimeType, result.ContentEncoding)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", result.MimeType)
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("ETag", `"`+result.LuaProject.DraftHash.String+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(archive)
}

func (a *API) DownloadLuaProject(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok {
		return
	}
	hash, ok := luaProjectHash(w, r)
	if !ok || !a.canLuaProjectViewOrUse(w, r, id) {
		return
	}
	// Only currently published hashes are retrievable. An older package may
	// remain in an HTTP cache for at most the bounded public TTL after rotation.
	result, err := a.Opts.Zed.GetPublishedLuaProjectArtifact(r.Context(), database.GetPublishedLuaProjectArtifactParams{ID: id, Hash: hash})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Published artifact not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	// Shared caches must never hold an admin-only response when the public
	// viewer grant is removed. Authorized non-public reads remain uncached.
	anonymous := policy.New().User(uuid.Nil)
	public, err := a.Opts.Zed.CheckOne(r.Context(), nil, policy.New().Lua_project(id).CanView_User(anonymous))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	cacheControl := "private, no-store"
	// Auth middleware can refresh the session and set a cookie. Such a
	// response must never enter a shared cache with that Set-Cookie header.
	if public && len(w.Header().Values("Set-Cookie")) == 0 {
		cacheControl = "private, max-age=3600"
		if r.Header.Get("Cookie") == "" && r.Header.Get("Authorization") == "" {
			cacheControl = "public, max-age=3600"
		}
	}
	etag := `"` + hash + `"`
	if r.Header.Get("If-None-Match") == etag {
		w.Header().Set("Cache-Control", cacheControl)
		w.Header().Set("ETag", etag)
		w.WriteHeader(http.StatusNotModified)
		return
	}
	archive, ok := a.luaZIP(w, r, result.ObjectKey, hash, result.MimeType, result.ContentEncoding)
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("ETag", etag)
	w.Header().Set("Content-Type", result.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, result.LuaProject.Slug))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(archive)
}
