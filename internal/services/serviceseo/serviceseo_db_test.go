package serviceseo

import (
	"context"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/pageload"
	"github.com/Emyrk/chronicle/internal/services/serviceog"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// TestSummaryDatabase seeds a character in listed, unlisted, invalidated and
// duplicate uploads, and checks both summaries against the real queries.
func TestSummaryDatabase(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitLong)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := conn.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	exec("SET app.tenant_bypass = 'true'")

	serverID, realmID, userID := uuid.New(), uuid.New(), uuid.New()
	exec("INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "seo-server-"+serverID.String())
	exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "SEO Realm")
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "seo-user-" + userID.String()})
	require.NoError(t, err)
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Hand of Ragnaros", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)

	const player = guid.GUID(0x1B230029F685)
	exec(`INSERT INTO game_players (id, realm_id, name, class, gender, race, level, guild_id) VALUES ($1, $2, 'Zeezee', 'WARLOCK', 'Female', 'Gnome', 60, $3)`,
		player.String(), realmID, guild.ID)

	base := time.Date(2026, time.March, 4, 19, 0, 0, 0, time.UTC)
	seed := func(name, slug string, daysAgo int, unlisted bool) uuid.UUID {
		t.Helper()
		logID, instanceID := uuid.New(), uuid.New()
		start := base.Add(-time.Duration(daysAgo) * 24 * time.Hour)
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logID, Owner: userID, LogType: database.LogTypeV2, Unlisted: unlisted,
			CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logID))
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: name,
			HashedSlug: pgtype.Text{String: slug, Valid: true}, Capabilities: []string{},
			StartTime: database.Timestamptz(start), GuildID: uuid.NullUUID{UUID: guild.ID, Valid: true},
		})
		require.NoError(t, err)
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: uuid.New(), InstanceID: instanceID, Name: "Lucifron", KillType: database.KillTypeClean,
			Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(83 * time.Second)),
		})
		require.NoError(t, err)
		store.InsertInstancePlayers(ctx, []database.InsertInstancePlayersParams{
			{InstanceID: instanceID, UnitGuid: player, Name: "Zeezee", Level: 60, Class: database.WowPlayableClassWARLOCK, Race: database.WowPlayableRaceGnome},
		}).Exec(func(_ int, err error) { require.NoError(t, err) })
		return instanceID
	}

	listed := seed("Molten Core", "seo-listed", 0, false)
	unlisted := seed("Blackwing Lair", "seo-unlisted", 1, true)
	invalidated := seed("Zul'Gurub", "seo-invalidated", 2, false)
	exec("UPDATE log_instances SET invalidated_at = now() WHERE id = $1", invalidated)
	original := seed("Onyxia's Lair", "seo-original", 3, false)
	duplicate := seed("Onyxia's Lair", "seo-duplicate", 3, false)
	exec("UPDATE log_instances SET duplicate_group_id = $1 WHERE id IN ($1, $2)", original, duplicate)
	// A log without its own instance name takes the upload's.
	unnamed := seed("", "seo-unnamed", 4, false)
	exec("INSERT INTO server_upload_meta (log_group_id, instance_id, instance_name) SELECT log_group_id, '533', 'Naxxramas' FROM log_instances WHERE id = $1", unnamed)

	s := New(Options{Store: store})
	get := func(path string) (string, string, bool) {
		got := s.Summary(httptest.NewRequest(http.MethodGet, "https://forever.chronicleclassic.com"+path, nil).WithContext(ctx))
		if got == nil {
			return "", "", false
		}
		return got.Description, got.HTML, true
	}

	description, html, ok := get("/instances/seo-listed")
	require.True(t, ok)
	require.Equal(t, "Molten Core run by Hand of Ragnaros on Mar 4, 2026: 1 boss killed in 1:23. Damage, healing and deaths for 1 players.", description)
	require.Contains(t, html, `<a href="/g/`+guild.ID.String()+`">Hand of Ragnaros</a>`)
	require.Contains(t, html, `<li>Lucifron in 1:23</li>`)
	require.Contains(t, html, `<a href="/armory/SEO%20Realm/0x00001B230029F685">Zeezee</a> (Warlock)`)

	_, _, ok = get("/instances/" + listed.String())
	require.True(t, ok)
	for _, path := range []string{"/instances/seo-unlisted", "/instances/" + unlisted.String()} {
		_, _, ok = get(path)
		require.False(t, ok, "unlisted instance %s must not render a summary", path)
	}

	description, html, ok = get("/armory/SEO%20Realm/0x00001B230029F685")
	require.True(t, ok)
	require.Equal(t, "Zeezee, level 60 Gnome Warlock of <Hand of Ragnaros>. Recent raids: Molten Core, Onyxia's Lair, Naxxramas. Raid logs and performance on Chronicle.", description)
	require.Contains(t, html, `Zeezee, level 60 Gnome Warlock on SEO Realm, member of <a href="/g/`+guild.ID.String()+`">Hand of Ragnaros</a>.`)
	require.Contains(t, html, `<a href="/instances/seo-listed">Molten Core</a>`)
	require.NotContains(t, html, "seo-unlisted")
	require.NotContains(t, html, "seo-invalidated")
	require.Equal(t, 1, strings.Count(html, "Onyxia&#39;s Lair"), "duplicate uploads list once")
	require.Contains(t, html, `<a href="/instances/seo-unnamed">Naxxramas</a>`)

	// Query counts for one page render: the indexing check (api), the
	// summary and the Open Graph metadata, without and with the shared
	// per-request cache.
	counted := &countingStore{Store: store}
	og := serviceog.New(serviceog.Options{Zed: authz.NewDatabaseOnly(slog.New(slog.DiscardHandler), counted)})
	ogRouter := chi.NewRouter()
	for _, route := range og.Routes() {
		ogRouter.Get(route.Pattern, func(_ http.ResponseWriter, r *http.Request) { route.Resolve(r) })
	}
	seo := New(Options{Store: counted})
	render := func(path string, cached bool) map[string]int {
		counted.reset()
		reqCtx := ctx
		if cached {
			reqCtx = pageload.WithCache(ctx)
		}
		r := httptest.NewRequest(http.MethodGet, "https://forever.chronicleclassic.com"+path, nil).WithContext(reqCtx)
		if parts := strings.Split(strings.Trim(path, "/"), "/"); parts[0] == "instances" {
			inst, err := pageload.InstanceWithUnlisted(reqCtx, counted, parts[1])
			require.NoError(t, err)
			require.False(t, inst.Unlisted)
		}
		require.NotNil(t, seo.Summary(r))
		ogRouter.ServeHTTP(httptest.NewRecorder(), r)
		return counted.snapshot()
	}
	require.Equal(t, map[string]int{"instance": 3, "encounters": 2, "players": 2}, render("/instances/seo-listed", false))
	require.Equal(t, map[string]int{"instance": 1, "encounters": 1, "players": 1}, render("/instances/seo-listed", true))
	require.Equal(t, map[string]int{"realm": 2, "player": 2, "recent": 1}, render("/armory/SEO%20Realm/0x00001B230029F685", false))
	require.Equal(t, map[string]int{"realm": 1, "player": 1, "recent": 1}, render("/armory/SEO%20Realm/0x00001B230029F685", true))
}

// countingStore counts the page lookups shared by the indexing check, the
// summary and the Open Graph metadata.
type countingStore struct {
	database.Store
	mu     sync.Mutex
	counts map[string]int
}

func (c *countingStore) count(name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts[name]++
}

func (c *countingStore) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts = map[string]int{}
}

func (c *countingStore) snapshot() map[string]int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return maps.Clone(c.counts)
}

func (c *countingStore) InstanceWithUnlisted(ctx context.Context, id uuid.UUID) (database.InstanceWithUnlistedRow, error) {
	c.count("instance")
	return c.Store.InstanceWithUnlisted(ctx, id)
}

func (c *countingStore) InstanceBySlugWithUnlisted(ctx context.Context, slug pgtype.Text) (database.InstanceBySlugWithUnlistedRow, error) {
	c.count("instance")
	return c.Store.InstanceBySlugWithUnlisted(ctx, slug)
}

func (c *countingStore) PublicInstance(ctx context.Context, id uuid.UUID) (database.LogInstancesGuild, error) {
	c.count("instance")
	return c.Store.PublicInstance(ctx, id)
}

func (c *countingStore) PublicInstanceBySlug(ctx context.Context, slug pgtype.Text) (database.LogInstancesGuild, error) {
	c.count("instance")
	return c.Store.PublicInstanceBySlug(ctx, slug)
}

func (c *countingStore) EncountersByInstanceID(ctx context.Context, id uuid.UUID) ([]database.LogInstanceEncounter, error) {
	c.count("encounters")
	return c.Store.EncountersByInstanceID(ctx, id)
}

func (c *countingStore) InstancePlayersByInstanceID(ctx context.Context, id uuid.UUID) ([]database.LogInstancePlayer, error) {
	c.count("players")
	return c.Store.InstancePlayersByInstanceID(ctx, id)
}

func (c *countingStore) GetWoWServerRealmByName(ctx context.Context, name string) (database.WowServerRealm, error) {
	c.count("realm")
	return c.Store.GetWoWServerRealmByName(ctx, name)
}

func (c *countingStore) GetGamePlayerByGUID(ctx context.Context, arg database.GetGamePlayerByGUIDParams) (database.GetGamePlayerByGUIDRow, error) {
	c.count("player")
	return c.Store.GetGamePlayerByGUID(ctx, arg)
}

func (c *countingStore) ListCharacterSummaryInstances(ctx context.Context, arg database.ListCharacterSummaryInstancesParams) ([]database.ListCharacterSummaryInstancesRow, error) {
	c.count("recent")
	return c.Store.ListCharacterSummaryInstances(ctx, arg)
}

