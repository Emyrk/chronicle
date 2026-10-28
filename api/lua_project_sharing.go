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
)

// addonAuthorName matches the addon_authors name check: the first part of /addons/<author>/<slug>.
var addonAuthorName = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// reservedAddonAuthorNames would collide with /addons routes or read as official.
var reservedAddonAuthorNames = map[string]bool{
	"api": true, "new": true, "edit": true, "me": true, "admin": true, "addons": true, "settings": true,
	"chronicle": true, "official": true, "support": true, "help": true,
}

func validAddonAuthorName(name string) bool {
	return len(name) >= 2 && len(name) <= 32 && addonAuthorName.MatchString(name) && !reservedAddonAuthorNames[name]
}

// suggestAddonAuthorName turns a username into an author name: lowercase letters, digits and single hyphens.
func suggestAddonAuthorName(username string) string {
	name := strings.Trim(nonAddonAuthorChars.ReplaceAllString(strings.ToLower(username), "-"), "-")
	return strings.TrimRight(name[:min(len(name), 32)], "-")
}

var nonAddonAuthorChars = regexp.MustCompile(`[^a-z0-9]+`)

// addonAuthorNames maps each user to their author name, when they have one.
func (a *API) addonAuthorNames(ctx context.Context, users []uuid.UUID) (map[uuid.UUID]string, error) {
	names := make(map[uuid.UUID]string, len(users))
	if len(users) == 0 {
		return names, nil
	}
	rows, err := a.Opts.Zed.ListAddonAuthorsByUsers(ctx, users)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		names[row.UserID] = row.Name
	}
	return names, nil
}

func (a *API) GetMyAddonAuthor(w http.ResponseWriter, r *http.Request) {
	author, err := a.Opts.Zed.GetAddonAuthorByUser(r.Context(), chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	// No name yet is a normal state, so it is not an error the browser logs.
	if errors.Is(err, pgx.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.AddonAuthor{Name: author.Name})
}

// SuggestAddonAuthor offers the caller's username as an author name, numbered when it is taken.
// The name is empty when no free variant was found; the caller then picks one.
func (a *API) SuggestAddonAuthor(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user, err := a.Opts.Zed.GetUserByID(ctx, chronauth.MustAuthenticatedClaims(ctx).Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	base := suggestAddonAuthorName(user.Username)
	for i := 1; i <= 9 && base != ""; i++ {
		name := base
		if i > 1 {
			suffix := "-" + strconv.Itoa(i)
			name = strings.TrimRight(base[:min(len(base), 32-len(suffix))], "-") + suffix
		}
		if !validAddonAuthorName(name) {
			continue
		}
		_, err := a.Opts.Zed.GetAddonAuthorByName(ctx, name)
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AddonAuthor{Name: name})
			return
		}
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AddonAuthor{})
}

// ClaimAddonAuthor sets the caller's author name once; addon URLs depend on it staying put.
func (a *API) ClaimAddonAuthor(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var req chroniclesdk.ClaimAddonAuthorRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if !validAddonAuthorName(req.Name) {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Author names are 2-32 lowercase letters, digits and single hyphens, and some names are reserved."})
		return
	}
	author, err := a.Opts.Zed.InsertAddonAuthor(r.Context(), database.InsertAddonAuthorParams{UserID: chronauth.MustAuthenticatedClaims(r.Context()).Subject, Name: req.Name})
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
	httpapi.Write(r.Context(), w, http.StatusCreated, chroniclesdk.AddonAuthor{Name: author.Name})
}

// writeLuaProjectPage answers for anyone who may view the addon, including its main: viewers may run it.
func (a *API) writeLuaProjectPage(w http.ResponseWriter, r *http.Request, p database.LuaProject) {
	permissions, err := a.luaProjectPermissions(r, p.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !permissions.View {
		// Same answer as a missing addon, so private addons do not leak their existence.
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Addon not found."})
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
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Addon not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProjectPage(w, r, p)
}

// GetLuaProjectPageByPath resolves /addons/<author>/<slug>.
func (a *API) GetLuaProjectPageByPath(w http.ResponseWriter, r *http.Request) {
	p, err := a.Opts.Zed.GetLuaProjectByAuthorSlug(r.Context(), database.GetLuaProjectByAuthorSlugParams{Author: chi.URLParam(r, "author"), Slug: chi.URLParam(r, "slug")})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Addon not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	a.writeLuaProjectPage(w, r, p)
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
	author, err := a.Opts.Zed.GetAddonAuthorByName(r.Context(), chi.URLParam(r, "author"))
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "No one has that author name. Contributors claim one on the Addons page."})
		return database.LuaProject{}, database.AddonAuthor{}, false
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return database.LuaProject{}, database.AddonAuthor{}, false
	}
	return project, author, true
}

// publicLuaProjectRoutes serves addons to everyone, signed in or not. They still need the signed-in user,
// if any, so owners and contributors get their own view and permissions: optional authentication attaches
// the SpiceDB actor without requiring a session.
func (a *API) publicLuaProjectRoutes(r chi.Router) {
	r.Use(a.Auth.Authenticated(true))
	r.Get("/lua-projects", a.ListPublicLuaProjects)
	r.Get("/lua-projects/{projectID}", a.GetPublicLuaProject)
	r.Get("/lua-projects/{projectID}/page", a.GetLuaProjectPage)
	r.Get("/addons/{author}/{slug}", a.GetLuaProjectPageByPath)
	r.Get("/lua-projects/{projectID}/artifacts/{hash}/package", a.DownloadLuaProject)
}
