package api

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
)

// moduleAuthorName matches the addon_authors name check: the first part of /modules/<author>/<slug>.
var moduleAuthorName = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// reservedModuleAuthorNames would collide with /modules routes or read as official. Names under
// minModuleAuthorName characters, such as "api", "id", "edit" and GitHub's "page", are already
// ruled out by length. GitHub's reserved oddballs are documented at:
// https://github.com/Mottie/github-reserved-names/blob/master/oddballs.md
var reservedModuleAuthorNames = map[string]bool{
	"admin": true, "addons": true, "modules": true, "assets": true, "author": true, "authors": true, "avatars": true,
	"bookmarks": true, "browse": true, "checks": true, "chronicle": true, "conversations": true,
	"create": true, "explore": true, "featured": true, "help": true, "labels": true, "login": true,
	"media": true, "my-addons": true, "my-modules": true, "nodes": true, "official": true, "owners": true, "popular": true,
	"registry": true, "seats": true, "settings": true, "shared": true, "support": true, "tasks": true,
	"uploads": true, "workshop": true,
}

// minModuleAuthorName applies to new names only: the database still allows the shorter names claimed before.
const minModuleAuthorName = 5

func validModuleAuthorName(name string) bool {
	return len(name) >= minModuleAuthorName && len(name) <= 32 && moduleAuthorName.MatchString(name) && !reservedModuleAuthorNames[name]
}

// suggestModuleAuthorName turns a username into an author name: lowercase letters, digits and single hyphens.
func suggestModuleAuthorName(username string) string {
	name := strings.Trim(nonModuleAuthorChars.ReplaceAllString(strings.ToLower(username), "-"), "-")
	if name != "" && len(name) < minModuleAuthorName {
		name += "-modules"
	}
	return strings.TrimRight(name[:min(len(name), 32)], "-")
}

var nonModuleAuthorChars = regexp.MustCompile(`[^a-z0-9]+`)

// moduleAuthorNames maps each user to their author name, when they have one.
func (a *API) moduleAuthorNames(ctx context.Context, users []uuid.UUID) (map[uuid.UUID]string, error) {
	names := make(map[uuid.UUID]string, len(users))
	if len(users) == 0 {
		return names, nil
	}
	rows, err := a.Opts.Zed.ListModuleAuthorsByUsers(ctx, users)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		names[row.UserID] = row.Name
	}
	return names, nil
}

func (a *API) GetMyModuleAuthor(w http.ResponseWriter, r *http.Request) {
	author, err := a.Opts.Zed.GetModuleAuthorByUser(r.Context(), chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	// No name yet is a normal state, so it is not an error the browser logs.
	if errors.Is(err, pgx.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.ModuleAuthor{Name: author.Name})
}

// SuggestModuleAuthor offers the caller's username as an author name, numbered when it is taken.
// The name is empty when no free variant was found; the caller then picks one.
func (a *API) SuggestModuleAuthor(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, err := a.Opts.Zed.GetUserByID(ctx, chronauth.MustAuthenticatedClaims(ctx).Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	base := suggestModuleAuthorName(user.Username)
	for i := 1; i <= 9 && base != ""; i++ {
		name := base
		if i > 1 {
			suffix := "-" + strconv.Itoa(i)
			name = strings.TrimRight(base[:min(len(base), 32-len(suffix))], "-") + suffix
		}
		if !validModuleAuthorName(name) {
			continue
		}
		_, err := a.Opts.Zed.GetModuleAuthorByName(ctx, name)
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ModuleAuthor{Name: name})
			return
		}
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ModuleAuthor{})
}

// ClaimModuleAuthor sets the caller's author name once; module URLs depend on it staying put.
func (a *API) ClaimModuleAuthor(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var req chroniclesdk.ClaimModuleAuthorRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if !validModuleAuthorName(req.Name) {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Author names are 5-32 lowercase letters, digits and single hyphens, and some names are reserved."})
		return
	}
	author, err := a.Opts.Zed.InsertModuleAuthor(r.Context(), database.InsertModuleAuthorParams{UserID: chronauth.MustAuthenticatedClaims(r.Context()).Subject, Name: req.Name})
	if err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23505" {
			message := "That author name is taken."
			if pg.ConstraintName == "addon_authors_pkey" {
				message = "You already have an author name."
			}
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: message})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusCreated, chroniclesdk.ModuleAuthor{Name: author.Name})
}

// writeLuaProjectPage answers for anyone who may view the module, including its main: viewers may run it.
func (a *API) writeLuaProjectPage(w http.ResponseWriter, r *http.Request, p database.LuaProject) {
	permissions, err := a.luaProjectPermissions(r, p.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !permissions.View {
		// Same answer as a missing module, so private modules do not leak their existence.
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Module not found."})
		return
	}
	projects, err := a.luaProjectResponses(r.Context(), p)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.LuaProjectPage{Project: projects[0], Permissions: permissions})
}

func (a *API) GetLuaProjectPage(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok {
		return
	}
	p, err := a.Opts.Zed.GetLuaProject(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Module not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProjectPage(w, r, p)
}

// GetLuaProjectPageByPath resolves /modules/<author>/<slug>.
func (a *API) GetLuaProjectPageByPath(w http.ResponseWriter, r *http.Request) {
	p, err := a.Opts.Zed.GetLuaProjectByAuthorSlug(r.Context(), database.GetLuaProjectByAuthorSlugParams{Author: chi.URLParam(r, "author"), Slug: chi.URLParam(r, "slug")})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Module not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProjectPage(w, r, p)
}

// GetModuleAuthorPage lists an author's modules for /modules/<author>, keeping only those the caller may view.
func (a *API) GetModuleAuthorPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	author, err := a.Opts.Zed.GetModuleAuthorByName(ctx, chi.URLParam(r, "author"))
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Author not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	projects, err := a.Opts.Zed.ListLuaProjectsByOwner(ctx, author.UserID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	actor, ok := authz.ActorFromContext(ctx)
	if !ok {
		actor = policy.New().User(uuid.Nil)
	}
	visible := make([]database.LuaProject, 0, len(projects))
	for _, p := range projects {
		allowed, err := a.Opts.Zed.CheckOne(ctx, nil, policy.New().Lua_project(p.ID).CanView_User(actor))
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if allowed {
			visible = append(visible, p)
		}
	}
	out, err := a.luaProjectResponses(ctx, visible...)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ModuleAuthorPage{Author: author.Name, Projects: out})
}

func (a *API) ListLuaProjectContributors(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaEdit) {
		return
	}
	rows, err := a.Opts.Zed.ListLuaProjectContributors(r.Context(), id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := make([]chroniclesdk.LuaProjectContributor, 0, len(rows))
	for _, row := range rows {
		out = append(out, chroniclesdk.LuaProjectContributor{UserID: row.UserID, Author: row.AuthorName.String, Username: row.Username, Permissions: row.Permissions, AddedAt: row.CreatedAt.Time})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}

// PutLuaProjectContributor adds or updates a contributor, named by their author name.
func (a *API) PutLuaProjectContributor(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaManage) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var req chroniclesdk.PutLuaProjectContributorRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	permissions := make([]string, 0, len(req.Permissions))
	for _, permission := range req.Permissions {
		if !slices.Contains(luaContributorPermissions, permission) || slices.Contains(permissions, permission) {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Permissions must be distinct values from edit and release."})
			return
		}
		permissions = append(permissions, permission)
	}
	if len(permissions) == 0 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Grant at least one permission, or remove the contributor."})
		return
	}
	slices.Sort(permissions)
	project, contributor, ok := a.luaContributorTarget(w, r, id)
	if !ok {
		return
	}
	if contributor.UserID == project.OwnerID {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "The owner already has every permission."})
		return
	}
	// InTx keeps Postgres and SpiceDB together: a failed relation write rolls back the row, and a failed
	// commit reverts the relations. Outside it, a revoke could stick in the table but not in SpiceDB.
	if err := a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		_, err := tx.UpsertLuaProjectContributor(r.Context(), database.UpsertLuaProjectContributorParams{
			ProjectID: id, UserID: contributor.UserID, Permissions: permissions,
			AddedBy: uuid.NullUUID{UUID: chronauth.MustAuthenticatedClaims(r.Context()).Subject, Valid: true},
		})
		return err
	}, nil); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.ListLuaProjectContributors(w, r)
}

func (a *API) DeleteLuaProjectContributor(w http.ResponseWriter, r *http.Request) {
	id, ok := luaProjectID(w, r)
	if !ok || !a.canLuaProject(w, r, id, luaManage) {
		return
	}
	_, contributor, ok := a.luaContributorTarget(w, r, id)
	if !ok {
		return
	}
	if err := a.Opts.Zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		_, err := tx.DeleteLuaProjectContributor(r.Context(), database.DeleteLuaProjectContributorParams{ProjectID: id, UserID: contributor.UserID})
		return err
	}, nil); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.ListLuaProjectContributors(w, r)
}

var luaContributorPermissions = []string{"edit", "release"}

func (a *API) luaContributorTarget(w http.ResponseWriter, r *http.Request, id uuid.UUID) (database.LuaProject, database.AddonAuthor, bool) {
	project, err := a.Opts.Zed.GetLuaProject(r.Context(), id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return database.LuaProject{}, database.AddonAuthor{}, false
	}
	author, err := a.Opts.Zed.GetModuleAuthorByName(r.Context(), chi.URLParam(r, "author"))
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "No one has that author name. Contributors claim one on the Modules page."})
		return database.LuaProject{}, database.AddonAuthor{}, false
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return database.LuaProject{}, database.AddonAuthor{}, false
	}
	return project, author, true
}

// publicLuaProjectRoutes serves modules to everyone, signed in or not. They still need the signed-in user,
// if any, so owners and contributors get their own view and permissions: optional authentication attaches
// the SpiceDB actor without requiring a session.
func (a *API) publicLuaProjectRoutes(r chi.Router) {
	r.Use(a.Auth.Authenticated(true))
	r.Get("/lua-projects", a.ListPublicLuaProjects)
	r.Get("/lua-projects/{projectID}", a.GetPublicLuaProject)
	r.Get("/lua-projects/{projectID}/page", a.GetLuaProjectPage)
	r.Get("/modules/{author}", a.GetModuleAuthorPage)
	r.Get("/modules/{author}/{slug}", a.GetLuaProjectPageByPath)
	// Legacy aliases keep old links and API clients working.
	r.Get("/addons/{author}", a.GetModuleAuthorPage)
	r.Get("/addons/{author}/{slug}", a.GetLuaProjectPageByPath)
	r.Get("/lua-projects/{projectID}/artifacts/{hash}/package", a.DownloadLuaProject)
}
