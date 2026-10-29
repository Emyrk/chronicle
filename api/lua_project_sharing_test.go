package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestLuaProjectOwnershipQuotas(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name  string
		role  string
		limit int
	}{
		{name: "default", limit: 3},
		{name: "honored", role: "honored", limit: 5},
		{name: "revered", role: "revered", limit: 10},
		{name: "exalted", role: "exalted", limit: 20},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			zed := serviceauthz.Authz(testservices.Authz(t))
			owner := uuid.New()
			_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "quota-" + owner.String()})
			require.NoError(t, err)
			_, err = zed.InsertAddonAuthor(ctx, database.InsertAddonAuthorParams{UserID: owner, Name: "quota-" + owner.String()[:8]})
			require.NoError(t, err)
			if tc.role != "" {
				require.NoError(t, zed.SetUserChronicleRoles(ctx, owner, []string{tc.role}))
			}
			api := &API{Opts: &Options{Zed: zed, Logger: slog.Default()}}
			router := chi.NewRouter()
			router.Post("/me/lua-projects", api.CreateLuaProject)
			router.Get("/me/lua-projects/quota", api.GetMyLuaProjectQuota)
			router.Delete("/me/lua-projects/{projectID}", api.DeleteLuaProject)
			call := func(method, path, body string) *httptest.ResponseRecorder {
				req := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: owner}), owner))
				if body != "" {
					req.Header.Set("Content-Type", "application/json")
				}
				rec := httptest.NewRecorder()
				router.ServeHTTP(rec, req)
				return rec
			}
			projects := make([]chroniclesdk.LuaProject, 0, tc.limit)
			for i := range tc.limit {
				rec := call(http.MethodPost, "/me/lua-projects", `{"kind":"panel","name":"Addon `+strconv.Itoa(i)+`","slug":"addon-`+strconv.Itoa(i)+`"}`)
				require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
				var project chroniclesdk.LuaProject
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &project))
				projects = append(projects, project)
			}
			rec := call(http.MethodGet, "/me/lua-projects/quota", "")
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			var quota chroniclesdk.LuaProjectQuota
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &quota))
			require.Equal(t, chroniclesdk.LuaProjectQuota{Owned: int64(tc.limit), Limit: int64(tc.limit)}, quota)
			rec = call(http.MethodPost, "/me/lua-projects", `{"kind":"panel","name":"Too Many","slug":"too-many"}`)
			require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "shared storage and processing resources")

			require.Equal(t, http.StatusNoContent, call(http.MethodDelete, "/me/lua-projects/"+projects[0].ID.String(), "").Code)
			_, err = zed.GetLuaProject(ctx, projects[0].ID)
			require.ErrorIs(t, err, pgx.ErrNoRows)
			allowed, err := zed.CheckOne(ctx, nil, policy.New().Lua_project(projects[0].ID).CanManage_User(policy.New().User(owner)))
			require.NoError(t, err)
			require.False(t, allowed, "deletion removes every project relationship")
			require.Equal(t, http.StatusCreated, call(http.MethodPost, "/me/lua-projects", `{"kind":"panel","name":"Replacement","slug":"replacement"}`).Code)
		})
	}
}

func TestConcurrentLuaProjectCreationHonorsQuota(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	owner := uuid.New()
	_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "concurrent-" + owner.String()})
	require.NoError(t, err)
	_, err = zed.InsertAddonAuthor(ctx, database.InsertAddonAuthorParams{UserID: owner, Name: "concurrent-" + owner.String()[:8]})
	require.NoError(t, err)
	api := &API{Opts: &Options{Zed: zed, Logger: slog.Default()}}
	router := chi.NewRouter()
	router.Post("/me/lua-projects", api.CreateLuaProject)

	const attempts = 8
	codes := make(chan int, attempts)
	var wg sync.WaitGroup
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body := `{"kind":"panel","name":"Concurrent ` + strconv.Itoa(i) + `","slug":"concurrent-` + strconv.Itoa(i) + `"}`
			req := httptest.NewRequest(http.MethodPost, "/me/lua-projects", strings.NewReader(body)).WithContext(authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: owner}), owner))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			codes <- rec.Code
		}()
	}
	wg.Wait()
	close(codes)
	created, conflicts := 0, 0
	for code := range codes {
		switch code {
		case http.StatusCreated:
			created++
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("unexpected create status %d", code)
		}
	}
	require.Equal(t, 3, created)
	require.Equal(t, attempts-3, conflicts)
	owned, err := zed.CountLuaProjectsByOwner(ctx, owner)
	require.NoError(t, err)
	require.Equal(t, int64(3), owned)
}

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
	router.Get("/me/lua-projects/starred", api.ListStarredLuaProjects)
	router.Put("/me/lua-projects/{projectID}/star", api.StarLuaProject)
	router.Delete("/me/lua-projects/{projectID}/star", api.UnstarLuaProject)
	router.Get("/me/lua-projects/{projectID}", api.GetMyLuaProject)
	router.Delete("/me/lua-projects/{projectID}", api.DeleteLuaProject)
	router.Patch("/me/lua-projects/{projectID}", api.UpdateLuaProject)
	router.Get("/me/lua-projects/{projectID}/contributors", api.ListLuaProjectContributors)
	router.Put("/me/lua-projects/{projectID}/contributors/{author}", api.PutLuaProjectContributor)
	router.Delete("/me/lua-projects/{projectID}/contributors/{author}", api.DeleteLuaProjectContributor)
	router.Post("/me/lua-projects/{projectID}/releases", api.CreateLuaProjectRelease)
	router.Get("/lua-projects/{projectID}/page", api.GetLuaProjectPage)
	router.Get("/addons/{author}", api.GetAddonAuthorPage)
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
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, "/me/addon-author", `{"name":"stev"}`).Code, "names need 5 characters")
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, "/me/addon-author", `{"name":"browse"}`).Code, "reserved name")
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
	require.Equal(t, int64(1), project.Stars, "owners always track their own addons")
	require.True(t, project.Starred)
	_, err := zed.SetLuaProjectDraft(ctx, database.SetLuaProjectDraftParams{ID: project.ID, Hash: pgtype.Text{String: strings.Repeat("d", 64), Valid: true}, ExpectedRevision: 1})
	require.NoError(t, err)
	byID := "/lua-projects/" + project.ID.String() + "/page"

	// Everyone may view and use a new addon; only the owner sees the draft or manages it.
	code, public := page(uuid.Nil, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true}, public.Permissions)
	require.NotNil(t, public.Project.Main, "viewers may run main, so they see it")
	code, byPath := page(stranger, "/addons/steven/interrupt-tracker")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, project.ID, byPath.Project.ID)
	// Stars: anyone who may use an addon can track it; owners cannot stop tracking theirs.
	star := "/me/lua-projects/" + project.ID.String() + "/star"
	require.Equal(t, http.StatusConflict, call(owner, http.MethodDelete, star, "").Code)
	rec = call(stranger, http.MethodPut, star, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var starred chroniclesdk.LuaProjectStar
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &starred))
	require.Equal(t, chroniclesdk.LuaProjectStar{Stars: 2, Starred: true}, starred)
	require.Equal(t, http.StatusOK, call(stranger, http.MethodPut, star, "").Code, "starring twice is fine")
	rec = call(stranger, http.MethodGet, "/me/lua-projects/starred", "")
	var tracked []chroniclesdk.LuaProject
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &tracked))
	require.Len(t, tracked, 1)
	require.Equal(t, project.ID, tracked[0].ID)
	_, viewed := page(stranger, byID)
	require.True(t, viewed.Project.Starred)
	require.Equal(t, int64(2), viewed.Project.Stars)
	_, anonymous := page(uuid.Nil, byID)
	require.False(t, anonymous.Project.Starred, "signed-out visitors see the count only")
	require.Equal(t, http.StatusOK, call(stranger, http.MethodDelete, star, "").Code)
	_, viewed = page(stranger, byID)
	require.Equal(t, int64(1), viewed.Project.Stars)
	require.False(t, viewed.Project.Starred)

	// Descriptions: set by those who may release, trimmed, and at most 300 characters (not bytes).
	settings := "/me/lua-projects/" + project.ID.String()
	require.Equal(t, http.StatusForbidden, call(stranger, http.MethodPatch, settings, `{"description":"mine now"}`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPatch, settings, `{"description":"`+strings.Repeat("a", 301)+`"}`).Code)
	rec = call(owner, http.MethodPatch, settings, `{"description":"  `+strings.Repeat("é", 300)+`  "}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	rec = call(owner, http.MethodPatch, settings, `{"description":"  Tracks every kick and who missed one.  "}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var described chroniclesdk.LuaProject
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &described))
	require.Equal(t, "Tracks every kick and who missed one.", described.Description)
	require.Equal(t, int64(1), described.Stars, "the response is a full project")
	_, viewed = page(uuid.Nil, byID)
	require.Equal(t, "Tracks every kick and who missed one.", viewed.Project.Description)

	rec = call(stranger, http.MethodGet, "/addons/steven", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var authorPage chroniclesdk.AddonAuthorPage
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &authorPage))
	require.Equal(t, "steven", authorPage.Author)
	require.Len(t, authorPage.Projects, 1)
	require.Equal(t, project.ID, authorPage.Projects[0].ID)
	require.Equal(t, http.StatusNotFound, call(stranger, http.MethodGet, "/addons/nobody-here", "").Code)
	code, _ = page(stranger, "/addons/steven/missing")
	require.Equal(t, http.StatusNotFound, code)
	code, mine := page(owner, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true, Edit: true, Release: true, Manage: true}, mine.Permissions)
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
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/releases", `{"tag":"v1","expected_revision":2}`).Code)
	var listed []chroniclesdk.LuaProject
	require.NoError(t, json.Unmarshal(call(editor, http.MethodGet, "/me/lua-projects", "").Body.Bytes(), &listed))
	require.Len(t, listed, 1, "shared addons appear in the contributor's list")
	require.Equal(t, "steven", listed[0].Author)

	// Adding release lets them tag releases; removing them takes everything away.
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, contributors+"/helper", `{"permissions":["publish_unstable"]}`).Code, "the old grants are gone")
	require.Equal(t, http.StatusOK, call(owner, http.MethodPut, contributors+"/helper", `{"permissions":["release","edit"]}`).Code)
	require.Equal(t, http.StatusBadRequest, call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/releases", `{"tag":"bad tag","expected_revision":2}`).Code)
	rec = call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/releases", `{"tag":"v1.0","expected_revision":2}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var released chroniclesdk.LuaProject
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &released))
	require.Len(t, released.Releases, 1)
	require.Equal(t, "v1.0", released.Releases[0].Tag)
	require.True(t, released.Releases[0].Available)
	require.Equal(t, "helper", released.Releases[0].PublishedByAuthor, "a contributor's release names them")
	require.Equal(t, http.StatusConflict, call(editor, http.MethodPost, "/me/lua-projects/"+project.ID.String()+"/releases", `{"tag":"v1.0","expected_revision":3}`).Code, "tags are unique")
	require.Equal(t, http.StatusOK, call(owner, http.MethodDelete, contributors+"/helper", "").Code)
	code, removed := page(editor, byID)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, chroniclesdk.LuaProjectPermissions{View: true, Use: true}, removed.Permissions)
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodGet, contributors, "").Code)
	require.Equal(t, http.StatusForbidden, call(stranger, http.MethodDelete, settings, "").Code)
	require.Equal(t, http.StatusForbidden, call(editor, http.MethodDelete, settings, "").Code)
	require.Equal(t, http.StatusNoContent, call(owner, http.MethodDelete, settings, "").Code)
	code, _ = page(uuid.Nil, byID)
	require.Equal(t, http.StatusNotFound, code)
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

func TestReservedAddonAuthorNames(t *testing.T) {
	t.Parallel()
	for _, name := range []string{
		"assets", "avatars", "bookmarks", "checks", "conversations", "labels", "media", "nodes",
		"owners", "registry", "seats", "shared", "tasks", "uploads",
	} {
		require.False(t, validAddonAuthorName(name), name)
	}
	require.True(t, validAddonAuthorName("community-author"))
}

func TestSuggestAddonAuthor(t *testing.T) {
	t.Parallel()
	require.Equal(t, "steven-m", suggestAddonAuthorName("  Steven M.!"))
	require.Equal(t, "", suggestAddonAuthorName("✨✨"))
	require.Equal(t, "bob-addons", suggestAddonAuthorName("Bob"), "short names are padded to the minimum")
	require.Len(t, suggestAddonAuthorName(strings.Repeat("ab-", 20)), 32)

	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	api := &API{Opts: &Options{Zed: zed, Logger: slog.Default()}}
	tag := uuid.NewString()[:8]
	user := func(username string) uuid.UUID {
		id := uuid.New()
		_, err := zed.InsertUser(ctx, database.InsertUserParams{ID: id, Username: username})
		require.NoError(t, err)
		return id
	}
	suggest := func(user uuid.UUID) string {
		ctx := authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: user}), user)
		rec := httptest.NewRecorder()
		api.SuggestAddonAuthor(rec, httptest.NewRequest(http.MethodGet, "/me/addon-author/suggestion", nil).WithContext(ctx))
		require.Equal(t, http.StatusOK, rec.Code)
		var out chroniclesdk.AddonAuthor
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
		return out.Name
	}

	first := user("Tester " + tag)
	require.Equal(t, "tester-"+tag, suggest(first))
	mine := func(user uuid.UUID) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		api.GetMyAddonAuthor(rec, httptest.NewRequest(http.MethodGet, "/me/addon-author", nil).WithContext(authz.AsUser(chronauth.WithClaims(ctx, &claims.Claims{Subject: user}), user)))
		return rec
	}
	require.Equal(t, http.StatusNoContent, mine(first).Code, "no name yet is not an error")
	_, err := zed.InsertAddonAuthor(ctx, database.InsertAddonAuthorParams{UserID: first, Name: "tester-" + tag})
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, mine(first).Code)
	require.Equal(t, "tester-"+tag+"-2", suggest(user("TESTER_"+tag)), "a taken name gets a number")
	require.Equal(t, "admin-2", suggest(user("Admin")), "reserved names get a number")
	require.Equal(t, "", suggest(user("✨")), "no usable characters, no suggestion")
}
