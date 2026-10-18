package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUpdatePrivateLogVisibilityRejectsPublication(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	store := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "immutable-private-owner-" + ownerID.String()})
	require.NoError(t, err)
	logID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2,
		Private: true, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	handlerAPI := &API{Opts: &Options{Zed: zed}, Zed: zed}
	router := chi.NewRouter()
	router.Route("/{logID}", func(r chi.Router) {
		r.Use(httpmw.LogIDMiddleware)
		r.Put("/privacy", handlerAPI.UpdatePrivateLogVisibility)
	})

	request := httptest.NewRequest(http.MethodPut, "/"+logID.String()+"/privacy", strings.NewReader(`{"private":false}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(authz.AsUser(request.Context(), ownerID))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusConflict, response.Code, response.Body.String())

	private, err := store.GetWoWLogGroupPrivacy(ctx, logID)
	require.NoError(t, err)
	require.True(t, private)
}

func TestPrivateLogShareHandlersWithClaimsAndNoActor(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	store := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "share-link-owner-" + ownerID.String()})
	require.NoError(t, err)
	requesterID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: requesterID, Username: "share-link-requester-" + requesterID.String()})
	require.NoError(t, err)
	logID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2,
		Private: true, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	code := "authenticated-share-code"
	_, err = store.CreatePrivateLogShareLink(ctx, database.CreatePrivateLogShareLinkParams{
		ID: uuid.New(), LogGroupID: logID, Code: code, CreatedBy: ownerID,
	})
	require.NoError(t, err)

	handlerAPI := &API{Opts: &Options{Zed: zed}, Zed: zed}
	router := chi.NewRouter()
	router.Get("/private-log-shares/{code}", handlerAPI.ResolvePrivateLogShareLink)
	router.Post("/private-log-shares/{code}/request", handlerAPI.RequestPrivateLogAccess)

	request := httptest.NewRequest(http.MethodGet, "/private-log-shares/"+code, nil)
	request = request.WithContext(chronauth.WithClaims(request.Context(), &claims.Claims{Subject: ownerID}))
	response := httptest.NewRecorder()
	require.NotPanics(t, func() { router.ServeHTTP(response, request) })
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	var resolved chroniclesdk.PrivateLogShareResolution
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &resolved))
	require.Equal(t, "owner", resolved.AccessStatus)

	request = httptest.NewRequest(http.MethodPost, "/private-log-shares/"+code+"/request", nil)
	request = request.WithContext(chronauth.WithClaims(request.Context(), &claims.Claims{Subject: requesterID}))
	response = httptest.NewRecorder()
	require.NotPanics(t, func() { router.ServeHTTP(response, request) })
	require.Equal(t, http.StatusCreated, response.Code, response.Body.String())
}

func TestResolvePrivateLogShareLinkReturnsMetadataOnly(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(testutil.Logger(t), store)
	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "private-log-owner"})
	require.NoError(t, err)
	logID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2,
		Private: true, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	code := "opaque-private-code"
	link, err := store.CreatePrivateLogShareLink(ctx, database.CreatePrivateLogShareLinkParams{
		ID: uuid.New(), LogGroupID: logID, Code: code, CreatedBy: ownerID,
	})
	require.NoError(t, err)

	handlerAPI := &API{Opts: &Options{Zed: zed}, Zed: zed}
	router := chi.NewRouter()
	router.Get("/private-log-shares/{code}", handlerAPI.ResolvePrivateLogShareLink)

	request := httptest.NewRequest(http.MethodGet, "/private-log-shares/"+code, nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.NotContains(t, response.Body.String(), "instances")
	require.NotContains(t, response.Body.String(), "payload")

	var resolved chroniclesdk.PrivateLogShareResolution
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &resolved))
	require.Equal(t, logID, resolved.LogGroupID)
	require.Equal(t, "private-log-owner", resolved.OwnerName)
	require.True(t, resolved.Private)
	require.Empty(t, resolved.AccessStatus)

	_, err = store.RevokePrivateLogShareLink(ctx, database.RevokePrivateLogShareLinkParams{ID: link.ID, LogGroupID: logID})
	require.NoError(t, err)
	request = httptest.NewRequest(http.MethodGet, "/private-log-shares/"+code, strings.NewReader(""))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusNotFound, response.Code, response.Body.String())
}
