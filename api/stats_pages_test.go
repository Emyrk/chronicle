package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
)

func TestIsTurtleFork(t *testing.T) {
	t.Parallel()
	require.True(t, isTurtleFork(database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}))
	require.True(t, isTurtleFork(database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorOctoWoW}), "OctoWoW runs Turtle content")
	require.False(t, isTurtleFork(database.WoWFlavor{database.FlavorVanilla, database.FlavorWoWForever}))
	require.False(t, isTurtleFork(database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}))
}

// statsRouteStore serves no snapshots: every /stats page is 404.
type statsRouteStore struct{ database.Store }

func (statsRouteStore) GetStatsSnapshot(context.Context, database.GetStatsSnapshotParams) (database.StatsSnapshot, error) {
	return database.StatsSnapshot{}, pgx.ErrNoRows
}

// /stats routes answer GET and HEAD (chi returns 405 for an unregistered
// HEAD) and are handled by the stats service, not the SPA fallback.
func TestMountStatsAnswersHead(t *testing.T) {
	t.Parallel()
	stats, err := servicestats.New(servicestats.Options{Store: statsRouteStore{}, IndexNowKey: "test-key-1234"})
	require.NoError(t, err)
	api := testSEOAPI(t)
	api.Opts.Stats = stats
	r := chi.NewRouter()
	api.mountStats(r)
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		for path, want := range map[string]int{
			"/stats/about":  http.StatusNotFound,
			"/stats":        http.StatusNotFound,
			"/indexnow.txt": http.StatusOK,
			"/recent":       http.StatusTeapot,
		} {
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
			require.Equal(t, want, rec.Code, "%s %s", method, path)
		}
	}
}
