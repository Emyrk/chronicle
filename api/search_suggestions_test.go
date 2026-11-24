package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"golang.org/x/time/rate"
)

type suggestionStub struct {
	players func(context.Context, database.SuggestPlayersParams) ([]database.SuggestPlayersRow, error)
	guilds  func(context.Context, database.SuggestGuildsParams) ([]database.SuggestGuildsRow, error)
}

func (s suggestionStub) SuggestPlayers(ctx context.Context, p database.SuggestPlayersParams) ([]database.SuggestPlayersRow, error) {
	return s.players(ctx, p)
}
func (s suggestionStub) SuggestGuilds(ctx context.Context, p database.SuggestGuildsParams) ([]database.SuggestGuildsRow, error) {
	if s.guilds != nil {
		return s.guilds(ctx, p)
	}
	return nil, nil
}

func TestSearchSuggestionsLimits(t *testing.T) {
	t.Parallel()
	calls := 0
	db := suggestionStub{players: func(ctx context.Context, p database.SuggestPlayersParams) ([]database.SuggestPlayersRow, error) {
		calls++
		deadline, ok := ctx.Deadline()
		require.True(t, ok)
		require.LessOrEqual(t, time.Until(deadline), 750*time.Millisecond)
		return nil, nil
	}}
	handler := newSearchSuggestionsHandler(db)
	for _, q := range []string{"", "a", "é", "a\x00b", strings.Repeat("界", 65), string([]byte{0xff, 0xfe})} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest("GET", "/?q="+url.QueryEscape(q), nil))
		require.Equal(t, http.StatusBadRequest, w.Code)
	}
	require.Zero(t, calls)
	for _, q := range []string{"界界", strings.Repeat("界", 64)} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest("GET", "/?q="+url.QueryEscape(q), nil))
		require.Equal(t, http.StatusOK, w.Code)
		require.JSONEq(t, `{"players":[],"guilds":[]}`, w.Body.String())
	}
	slots := make(chan struct{}, 1)
	slots <- struct{}{}
	for _, h := range []http.HandlerFunc{
		searchSuggestionsHandler(db, rate.NewLimiter(0, 0), make(chan struct{}, 1)),
		searchSuggestionsHandler(db, rate.NewLimiter(rate.Inf, 1), slots),
	} {
		w := httptest.NewRecorder()
		h(w, httptest.NewRequest("GET", "/?q=test", nil))
		require.Equal(t, http.StatusTooManyRequests, w.Code)
		require.Equal(t, "1", w.Header().Get("Retry-After"))
	}
	require.Equal(t, 2, calls)
}

func TestSearchSuggestionsDatabase(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	db := database.NewQueries(conn)
	// The production broker registers tenant hooks. Use one isolated connection
	// and invoke those same hooks explicitly rather than mutate global hooks.
	require.NoError(t, servicetenant.PrepareConn(servicetenant.AdminBypass(ctx), conn.Conn()))
	tenantIDs := []uuid.UUID{uuid.New(), uuid.New()}
	realms := make([]uuid.UUID, 0, 3)
	for i, tenantID := range tenantIDs {
		servicetenant.ResetConn(conn.Conn())
		require.NoError(t, servicetenant.PrepareConn(servicetenant.AdminBypass(ctx), conn.Conn()))
		_, err := db.InsertTenant(ctx, database.InsertTenantParams{ID: tenantID, Name: tenantID.String(), Branding: []byte(`{}`), ParseConfig: []byte(`{}`), ExternalLinking: []byte(`{}`), AvailableFormats: []string{}, AdditionalFlavor: []string{}, DisabledAds: []string{}})
		require.NoError(t, err)

		count := 1
		if i == 0 {
			count = 2
		}
		for j := 0; j < count; j++ {
			servicetenant.ResetConn(conn.Conn())
			require.NoError(t, servicetenant.PrepareConn(servicetenant.AdminBypass(ctx), conn.Conn()))
			server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: uuid.NewString()})
			require.NoError(t, err)
			require.NoError(t, db.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenantID, Valid: true}}))
			servicetenant.ResetConn(conn.Conn())
			require.NoError(t, servicetenant.PrepareConn(servicetenant.WithTenantID(ctx, tenantID), conn.Conn()))
			realmName := "Realm " + tenantID.String()
			if j == 1 {
				realmName += " other"
			}
			realm, err := db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: realmName})
			require.NoError(t, err)
			realms = append(realms, realm.ID)
			names := []string{"Alpha", "ALPHA", "Alphabet", "Alpine", "Alps", "Altar", "Alto", "Éclair", "École", "A%literal", "A_literal", `A\literal`, "\U0010ffff\U0010ffff", "X\uD7FFend", "X\U0010ffffend"}
			for k, name := range names {
				_, err := db.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm.ID, Name: name, CreatedAt: pgtype.Timestamptz{Valid: true, Time: dbtestutil.NowInDefaultTimezone()}})
				require.NoError(t, err)
				batch := db.UpsertPlayers(ctx, []database.UpsertPlayersParams{{ID: guid.GUID(k + 1), RealmID: realm.ID, Name: name, Class: database.WowPlayableClassWARRIOR, Gender: "Male", Race: "Human", UpdatedAt: pgtype.Timestamptz{Valid: true, Time: dbtestutil.NowInDefaultTimezone()}}})
				require.NoError(t, batch.Close())
			}
		}
	}
	servicetenant.ResetConn(conn.Conn())
	handler := newSearchSuggestionsHandler(db)
	search := func(tenant uuid.UUID, q string) chroniclesdk.SearchSuggestionsResponse {
		t.Helper()
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/?q="+url.QueryEscape(q)+"&limit=1000", nil).WithContext(servicetenant.WithTenantID(ctx, tenant))
		require.NoError(t, servicetenant.PrepareConn(req.Context(), conn.Conn()))
		handler(w, req)
		servicetenant.ResetConn(conn.Conn())
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		var result chroniclesdk.SearchSuggestionsResponse
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
		return result
	}
	first := search(tenantIDs[0], "aL")
	require.Len(t, first.Players, 5)
	require.Len(t, first.Guilds, 5)
	require.Equal(t, first, search(tenantIDs[0], "aL"))
	for _, p := range first.Players {
		require.Contains(t, realms[:2], p.RealmID)
	}
	for _, g := range first.Guilds {
		require.Contains(t, realms[:2], g.RealmID)
	}
	exact := search(tenantIDs[0], "ALPHA")
	require.Len(t, exact.Players, 5)
	require.Len(t, exact.Guilds, 5)
	for i := 0; i < 4; i++ {
		require.Equal(t, "alpha", strings.ToLower(exact.Players[i].Name))
		require.Equal(t, "alpha", strings.ToLower(exact.Guilds[i].Name))
	}
	require.Equal(t, "Alphabet", exact.Players[4].Name)
	for _, q := range []string{"A%", "A_", `A\`, "éCl", "\U0010ffff\U0010ffff", "X\uD7FF", "X\U0010ffff"} {
		result := search(tenantIDs[0], q)
		require.Len(t, result.Players, 2)
		require.Len(t, result.Guilds, 2)
	}
	other := search(tenantIDs[1], "al")
	for _, p := range other.Players {
		require.Equal(t, realms[2], p.RealmID)
	}
	for _, g := range other.Guilds {
		require.Equal(t, realms[2], g.RealmID)
	}
	empty := search(uuid.Nil, "al")
	require.Empty(t, empty.Players)
	require.Empty(t, empty.Guilds)
}

func TestSearchSuggestionsCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	db := suggestionStub{players: func(ctx context.Context, _ database.SuggestPlayersParams) ([]database.SuggestPlayersRow, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}}
	slots := make(chan struct{}, 1)
	handler := searchSuggestionsHandler(db, rate.NewLimiter(rate.Inf, 1), slots)
	w := httptest.NewRecorder()
	handler(w, httptest.NewRequest("GET", "/?q=alpha", nil).WithContext(ctx))
	require.Equal(t, http.StatusInternalServerError, w.Code)
	require.Empty(t, slots)
}

// The current schema globally prohibits duplicate realm labels. Keep the wire
// contract unambiguous even if labels repeat in a future dataset/schema.
func TestSearchSuggestionsDuplicateRealmLabels(t *testing.T) {
	t.Parallel()
	realms := []uuid.UUID{uuid.New(), uuid.New()}
	db := suggestionStub{
		players: func(context.Context, database.SuggestPlayersParams) ([]database.SuggestPlayersRow, error) {
			return []database.SuggestPlayersRow{{ID: 1, Name: "Alice", RealmID: realms[0], RealmName: "Realm"}, {ID: 1, Name: "Alice", RealmID: realms[1], RealmName: "Realm"}}, nil
		},
		guilds: func(context.Context, database.SuggestGuildsParams) ([]database.SuggestGuildsRow, error) {
			return []database.SuggestGuildsRow{{ID: uuid.New(), Name: "Allies", RealmID: realms[0], RealmName: "Realm"}, {ID: uuid.New(), Name: "Allies", RealmID: realms[1], RealmName: "Realm"}}, nil
		},
	}
	w := httptest.NewRecorder()
	newSearchSuggestionsHandler(db)(w, httptest.NewRequest("GET", "/?q=al", nil))
	require.Equal(t, http.StatusOK, w.Code)
	var result chroniclesdk.SearchSuggestionsResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
	require.Len(t, result.Players, 2)
	require.Len(t, result.Guilds, 2)
	for i, realm := range realms {
		require.Equal(t, realm, result.Players[i].RealmID)
		require.Equal(t, realm, result.Guilds[i].RealmID)
	}
}
