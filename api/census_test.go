package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// The default census (90 days, every realm) is served from the per-tenant
// cache; filtered views still query directly.
func TestCensusCachesDefaultView(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitLong)
	cfg, err := pgxpool.ParseConfig(dbtestutil.NewConnectionURL(t))
	require.NoError(t, err)
	cfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	const realm = "00000000-0000-4000-8000-0000000000c2"
	for _, stmt := range []string{
		`INSERT INTO wow_servers (id, name) VALUES ('00000000-0000-4000-8000-0000000000c1', 'Census server')`,
		`INSERT INTO wow_server_realms (id, server_id, name) VALUES ('` + realm + `', '00000000-0000-4000-8000-0000000000c1', 'Census realm')`,
		`INSERT INTO game_players (id, realm_id, name, class, gender, race) VALUES ('0x00000000000000C3', '` + realm + `', 'Grunt', 'WARRIOR', 'Male', 'Orc')`,
	} {
		_, err = pool.Exec(ctx, stmt)
		require.NoError(t, err)
	}

	handlerAPI := &API{AppContext: ctx, Opts: &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), database.New(pool)), Logger: testutil.Logger(t)}}
	router := chi.NewRouter()
	router.Get("/census", handlerAPI.Census)
	total := func(query string) int64 {
		t.Helper()
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/census"+query, nil).WithContext(ctx))
		require.Equal(t, http.StatusOK, res.Code, res.Body.String())
		var entries []chroniclesdk.CensusEntry
		require.NoError(t, json.Unmarshal(res.Body.Bytes(), &entries))
		var sum int64
		for _, e := range entries {
			sum += e.Count
		}
		return sum
	}

	require.Equal(t, int64(1), total(""), "the first default request waits for real data")

	_, err = pool.Exec(ctx, `INSERT INTO game_players (id, realm_id, name, class, gender, race) VALUES ('0x00000000000000C4', $1, 'Footman', 'WARRIOR', 'Male', 'Human')`, realm)
	require.NoError(t, err)

	require.Equal(t, int64(1), total(""), "default view comes from the cache")
	require.Equal(t, int64(1), total("?days=90"), "an explicit default is the same cached view")
	require.Equal(t, int64(2), total("?days=30"), "another window queries directly")
	require.Equal(t, int64(2), total("?realm_id="+realm), "a realm filter queries directly")
}
