package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

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
