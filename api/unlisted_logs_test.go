package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestMarkLogUnlistedRejectsPublication(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	store := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "immutable-unlisted-owner-" + ownerID.String()})
	require.NoError(t, err)
	logID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2,
		Unlisted: true, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	handlerAPI := &API{Opts: &Options{Zed: zed}, Zed: zed}
	router := chi.NewRouter()
	router.Route("/{logID}", func(r chi.Router) {
		r.Use(httpmw.LogIDMiddleware)
		r.Put("/unlisted", handlerAPI.MarkLogUnlisted)
	})

	request := httptest.NewRequest(http.MethodPut, "/"+logID.String()+"/unlisted", strings.NewReader(`{"unlisted":false}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(authz.AsUser(request.Context(), ownerID))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusConflict, response.Code, response.Body.String())

	unlisted, err := store.GetWoWLogGroupUnlisted(ctx, logID)
	require.NoError(t, err)
	require.True(t, unlisted)
}
