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
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// TestWoWLogGroupBySource covers the uploader's pre-flight check: what the
// caller already holds under a content-keyed source id, and that the answer is
// scoped to the caller.
func TestWoWLogGroupBySource(t *testing.T) {
	t.Parallel()

	store, _ := dbtestutil.NewDB(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	now := database.Timestamptz(time.Now())

	owner := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "u-" + owner.String()[:8]})
	require.NoError(t, err)
	groupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: groupID, Owner: owner, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: uuid.New(), Owner: owner, Hash: "hash-1", WowLogID: groupID, SizeBytes: 4096,
		MimeType: "text/plain", CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertLogGroupSource(ctx, database.InsertLogGroupSourceParams{
		LogGroupID: groupID, Owner: owner, SourceID: "chr1-65536-abcd",
	}))

	handlerAPI := &API{Opts: &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)}}
	get := func(caller uuid.UUID, sourceID string) *httptest.ResponseRecorder {
		router := chi.NewRouter()
		router.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				next.ServeHTTP(w, r.WithContext(chronauth.WithClaims(r.Context(), &claims.Claims{Subject: caller})))
			})
		})
		router.Get("/logs/by-source-id/{source-id}", handlerAPI.WoWLogGroupBySource)

		req := httptest.NewRequest(http.MethodGet, "http://chronicle.test/logs/by-source-id/"+sourceID, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req.WithContext(ctx))
		return rec
	}

	rec := get(owner, "chr1-65536-abcd")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var got chroniclesdk.LogSourceResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, groupID, got.LogID)
	require.Equal(t, int64(4096), got.Size)
	require.Equal(t, "http://chronicle.test/logs/"+groupID.String(), got.URL)

	// A source id nobody uploaded, and one another user uploaded, are both 404.
	require.Equal(t, http.StatusNotFound, get(owner, "chr1-65536-never").Code)
	require.Equal(t, http.StatusNotFound, get(uuid.New(), "chr1-65536-abcd").Code)

	// An over-long id is rejected without a query.
	require.Equal(t, http.StatusNotFound, get(owner, strings.Repeat("x", maxSourceIDLen+1)).Code)
}
