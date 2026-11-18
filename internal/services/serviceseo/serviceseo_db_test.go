package serviceseo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
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

	s := New(store)
	get := func(path string) (string, string, bool) {
		got := s.Summary(httptest.NewRequest(http.MethodGet, "https://forever.chronicleclassic.com"+path, nil).WithContext(ctx))
		if got == nil {
			return "", "", false
		}
		return got.Description, got.HTML, true
	}

	description, html, ok := get("/instances/seo-listed")
	require.True(t, ok)
	require.Equal(t, "Molten Core clear by Hand of Ragnaros on Mar 4, 2026: 1/1 bosses in 1:23. Damage, healing and deaths for 1 players.", description)
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
	require.Equal(t, "Zeezee, level 60 Gnome Warlock of <Hand of Ragnaros>. Recent raids: Molten Core, Onyxia's Lair. Raid logs and performance on Chronicle.", description)
	require.Contains(t, html, `Zeezee, level 60 Gnome Warlock on SEO Realm, member of <a href="/g/`+guild.ID.String()+`">Hand of Ragnaros</a>.`)
	require.Contains(t, html, `<a href="/instances/seo-listed">Molten Core</a>`)
	require.NotContains(t, html, "seo-unlisted")
	require.NotContains(t, html, "seo-invalidated")
	require.Equal(t, 1, strings.Count(html, "Onyxia&#39;s Lair"), "duplicate uploads list once")
}

