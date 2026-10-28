package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestLuaProjectPermissions(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	owner, editor, stranger := uuid.New(), uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{owner, editor, stranger} {
		_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: id, Username: "Display " + id.String()[:4]})
		require.NoError(t, err)
	}
	api := &API{Opts: &Options{Zed: zed, Logger: slog.Default()}}
	router := chi.NewRouter()
	router.Put("/me/addon-author", api.ClaimAddonAuthor)
	router.Post("/me/lua-projects", api.CreateLuaProject)
	router.Get("/me/lua-projects", api.ListMyLuaProjects)
	router.Get("/me/lua-projects/{projectID}", api.GetMyLuaProject)
	router.Get("/me/lua-projects/{projectID}/contributors", api.ListLuaProjectContributors)
	router.Put("/me/lua-projects/{projectID}/contributors/{author}", api.PutLuaProjectContributor)
	router.Delete("/me/lua-projects/{projectID}/contributors/{author}", api.DeleteLuaProjectContributor)
	router.Post("/me/lua-projects/{projectID}/{channel:stable|unstable}", api.PublishLuaProject)
	router.Get("/lua-projects/{projectID}/page", api.GetLuaProjectPage)
	router.Get("/addons/{author}/{slug}", api.GetLuaProjectPageByPath)
	as := func(user uuid.UUID) context.Context {
		if user == uuid.Nil {
			return ctx
		}
		return authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: user}), user)
	}
	call := func(user uuid.UUID, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(as(user))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	page := func(user uuid.UUID, path string) (int, chroniclesdk.LuaProjectPage) {
		rec := call(user, http.MethodGet, path, "")
		var out chroniclesdk.LuaProjectPage
		if rec.Code == http.StatusOK {
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		}
		return rec.Code, out
	}

	// An author name comes before any addon, and is unique and URL-safe.
	create := `{"kind":"panel","name":"Interrupt Tracker","slug":"interrupt-tracker"}`
	require.Equal(t, http.StatusConflict, call(owner, http.MethodPost, "/me/lua-projects", create).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, "/me/addon-author", `{"name":"Steven"}`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, "/me/addon-author", `{"name":"api"}`).Code)
	require.Equal(t, http.StatusCreated, call(owner, http.MethodPut, "/me/addon-author", `{"name":"steven"}`).Code)
	require.Equal(t, http.StatusConflict, call(owner, http.MethodPut, "/me/addon-author", `{"name":"steven-2"}`).Code, "the name cannot change")
	require.Equal(t, http.StatusConflict, call(editor, http.MethodPut, "/me/addon-author", `{"name":"steven"}`).Code, "names are unique")
	require.Equal(t, http.StatusCreated, call(editor, http.MethodPut, "/me/addon-author", `{"name":"helper"}`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPost, "/me/lua-projects", `{"kind":"panel","name":"Edit","slug":"edit"}`).Code, "reserved slug")
	rec := call(owner, http.MethodPost, "/me/lua-projects", create)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var project chroniclesdk.LuaProject
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &project))
	require.Equal(t, "steven", project.Author)
	_, err := zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: strings.Repeat("d", 64), Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	byID := "/lua-projects/" + project.ID.String() + "/page"

	// Everyone may view and use a new addon; only the owner sees the draft or manages it.
	code, public := page(uuid.Nil, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true}, public.Permissions)
	require.Empty(t, public.Project.DraftSHA256, "the public view never shows the draft")
	code, byPath := page(stranger, "/addons/steven/interrupt-tracker")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, project.ID, byPath.Project.ID)
	code, _ = page(stranger, "/addons/steven/missing")
	require.Equal(t, http.StatusNotFound, code)
	code, mine := page(owner, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true, Edit: true, PublishUnstable: true, Publish: true, Manage: true}, mine.Permissions)
	require.NotEmpty(t, mine.Project.DraftSHA256)
	require.Equal(t, http.StatusForbidden, call(stranger, http.MethodGet, "/me/lua-projects/"+project.ID.String(), "").Code)

	// Contributors get exactly the grants the owner picks.
	contributors := "/me/lua-projects/" + project.ID.String() + "/contributors"
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodPut, contributors+"/helper", `{"permissions":["edit"]}`).Code, "only the owner shares")
	require.Equal(t, http.StatusNotFound, call(owner, http.MethodPut, contributors+"/nobody", `{"permissions":["edit"]}`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, contributors+"/helper", `{"permissions":["delete"]}`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, contributors+"/steven", `{"permissions":["edit"]}`).Code, "the owner is not a contributor")
	rec = call(owner, http.MethodPut, contributors+"/helper", `{"permissions":["edit"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var team []chroniclesdk.LuaProjectContributor
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &team))
	require.Len(t, team, 1)
	require.Equal(t, "helper", team[0].Author)
	require.Equal(t, []string{"edit"}, team[0].Permissions)
	code, shared := page(editor, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true, Edit: true}, shared.Permissions)
	require.Equal(t, http.StatusOK, call(editor, http.MethodGet, "/me/lua-projects/"+project.ID.String(), "").Code)
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/unstable", `{"expected_revision":2}`).Code)
	var listed []chroniclesdk.LuaProject
	require.NoError(t, json.Unmarshal(call(editor, http.MethodGet, "/me/lua-projects", "").Body.Bytes(), &listed))
	require.Len(t, listed, 1, "shared addons appear in the contributor's list")
	require.Equal(t, "steven", listed[0].Author)

	// Adding publish_unstable lets them publish; removing them takes everything away.
	require.Equal(t, http.StatusOK, call(owner, http.MethodPut, contributors+"/helper", `{"permissions":["publish_unstable","edit"]}`).Code)
	rec = call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/unstable", `{"expected_revision":2}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/stable", `{"expected_revision":3,"tested_sha256":"`+strings.Repeat("d", 64)+`"}`).Code)
	require.Equal(t, http.StatusOK, call(owner, http.MethodDelete, contributors+"/helper", "").Code)
	code, removed := page(editor, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true}, removed.Permissions)
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodGet, contributors, "").Code)
}

// The real public routes must see the signed-in user; requests carry session claims, not a SpiceDB actor.
func TestPublicLuaProjectRoutesSeeTheSignedInUser(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	owner := uuid.New()
	_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "owner-" + owner.String()[:4]})
	require.NoError(t, err)
	project, err := zed.CreateLuaProject(ctx, database.CreateLuaProjectParams{OwnerID: owner, Kind: "panel", Name: "Mine", Slug: "mine"})
	require.NoError(t, err)

	// Both requests take the production path: session middleware first, then the public routes.
	auth := &chronauth.Service{Store: sessions.NewCookieStore([]byte("test-session-secret"))}
	api := &API{Opts: &Options{Zed: zed, Logger: slog.Default()}, Auth: auth}
	router := chi.NewRouter()
	router.Use(auth.AuthenticationMiddleware)
	router.Group(api.publicLuaProjectRoutes)
	page := func(requestCtx context.Context) chroniclesdk.LuaProjectPermissions {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/lua-projects/"+project.ID.String()+"/page", nil).WithContext(requestCtx))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var out chroniclesdk.LuaProjectPage
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		return out.Permissions
	}
	require.True(t, page(chronauth.WithClaims(ctx, &claims.Claims{Subject: owner})).Manage, "the owner must get the owner view")
	require.False(t, page(ctx).Edit, "signed-out visitors still get the public view")
}
