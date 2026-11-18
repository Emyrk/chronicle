package serviceseo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

// fakeStore serves one instance (by ID or slug) and one character. Anything
// else is not found, as an unlisted instance is for the Public* lookups.
type fakeStore struct {
	instance   database.LogInstancesGuild
	encounters []database.LogInstanceEncounter
	players    []database.LogInstancePlayer
	realm      database.WowServerRealm
	character  database.GetGamePlayerByGUIDRow
	recent     []database.ListCharacterSummaryInstancesRow
}

func (f *fakeStore) PublicInstance(_ context.Context, id uuid.UUID) (database.LogInstancesGuild, error) {
	if id != f.instance.ID {
		return database.LogInstancesGuild{}, pgx.ErrNoRows
	}
	return f.instance, nil
}

func (f *fakeStore) PublicInstanceBySlug(_ context.Context, slug pgtype.Text) (database.LogInstancesGuild, error) {
	if slug != f.instance.HashedSlug {
		return database.LogInstancesGuild{}, pgx.ErrNoRows
	}
	return f.instance, nil
}

func (f *fakeStore) EncountersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return f.encounters, nil
}

func (f *fakeStore) InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error) {
	return f.players, nil
}

func (f *fakeStore) GetWoWServerRealmByName(_ context.Context, name string) (database.WowServerRealm, error) {
	if name != f.realm.Name {
		return database.WowServerRealm{}, pgx.ErrNoRows
	}
	return f.realm, nil
}

func (f *fakeStore) GetGamePlayerByGUID(_ context.Context, arg database.GetGamePlayerByGUIDParams) (database.GetGamePlayerByGUIDRow, error) {
	if arg.RealmID != f.character.RealmID || arg.Identifier != f.character.ID {
		return database.GetGamePlayerByGUIDRow{}, pgx.ErrNoRows
	}
	return f.character, nil
}

func (f *fakeStore) ListCharacterSummaryInstances(context.Context, database.ListCharacterSummaryInstancesParams) ([]database.ListCharacterSummaryInstancesRow, error) {
	return f.recent, nil
}

var raidStart = time.Date(2026, time.March, 4, 19, 0, 0, 0, time.UTC)

func encounter(name string, boss bool, kill database.KillType, startMin, seconds int) database.LogInstanceEncounter {
	start := raidStart.Add(time.Duration(startMin) * time.Minute)
	return database.LogInstanceEncounter{
		Name: name, Boss: boss, KillType: kill,
		StartTime: database.Timestamptz(start),
		EndTime:   database.Timestamptz(start.Add(time.Duration(seconds) * time.Second)),
	}
}

func testStore() *fakeStore {
	realmID := uuid.New()
	guildID := uuid.New()
	return &fakeStore{
		instance: database.LogInstancesGuild{
			ID: uuid.New(), Name: "Molten Core", RealmName: "Normal-EU",
			HashedSlug: pgtype.Text{String: "dQ2x2_bgihG2_kUf", Valid: true},
			GuildID:    uuid.NullUUID{UUID: guildID, Valid: true},
			GuildName:  pgtype.Text{String: "Hand of Ragnaros", Valid: true},
		},
		encounters: []database.LogInstanceEncounter{
			// Out of order on purpose: the summary lists kills by time.
			encounter("Magmadar", true, database.KillTypeClean, 20, 95),
			encounter("Lucifron", true, database.KillTypeClean, 0, 83),
			encounter("Gehennas", true, database.KillTypeWipe, 30, 40),
			encounter("Gehennas", true, database.KillTypePartial, 35, 70),
			encounter("Trash", false, database.KillTypeClean, 10, 30),
		},
		players: []database.LogInstancePlayer{
			{UnitGuid: guid.GUID(0x1B230029F685), Name: "Zeezee", Class: database.WowPlayableClassWARLOCK},
			{UnitGuid: guid.GUID(0x2), Name: "Brick", Class: database.WowPlayableClassWARRIOR},
			{UnitGuid: guid.GUID(0x3), Name: "Mystery", Class: database.WowPlayableClassUNKNOWN},
		},
		realm: database.WowServerRealm{ID: realmID, Name: "Normal-EU"},
		character: database.GetGamePlayerByGUIDRow{
			ID: guid.GUID(0x1B230029F685), RealmID: realmID, RealmName: "Normal-EU", Name: "Zeezee",
			Level: 60, Race: database.WowPlayableRaceGnome, Class: database.WowPlayableClassWARLOCK,
			GuildID:   uuid.NullUUID{UUID: guildID, Valid: true},
			GuildName: pgtype.Text{String: "Hand of Ragnaros", Valid: true},
		},
		recent: []database.ListCharacterSummaryInstancesRow{
			{ID: uuid.New(), HashedSlug: pgtype.Text{String: "dQ2x2_bgihG2_kUf", Valid: true}, Name: "Molten Core", StartTime: database.Timestamptz(raidStart)},
			{ID: uuid.MustParse("6f9619ff-8b86-d011-b42d-00cf4fc964ff"), Name: "Onyxia's Lair", StartTime: database.Timestamptz(raidStart.Add(-24 * time.Hour))},
			{ID: uuid.New(), Name: "Molten Core", StartTime: database.Timestamptz(raidStart.Add(-7 * 24 * time.Hour))},
		},
	}
}

func summary(t *testing.T, store Store, path string) (description, html string, ok bool) {
	t.Helper()
	got := New(store).Summary(httptest.NewRequest(http.MethodGet, "https://forever.chronicleclassic.com"+path, nil))
	if got == nil {
		return "", "", false
	}
	return got.Description, got.HTML, true
}

func TestInstanceSummary(t *testing.T) {
	t.Parallel()
	store := testStore()

	for _, identifier := range []string{store.instance.ID.String(), store.instance.HashedSlug.String} {
		description, html, ok := summary(t, store, "/instances/"+identifier)
		require.True(t, ok)
		require.Equal(t, "Molten Core clear by Hand of Ragnaros on Mar 4, 2026: 3/3 bosses in 36:10. Damage, healing and deaths for 3 players.", description)
		require.Equal(t, `<h1>Molten Core by Hand of Ragnaros</h1>`+
			`<p>Molten Core clear by <a href="/g/`+store.instance.GuildID.UUID.String()+`">Hand of Ragnaros</a> on Mar 4, 2026: 3/3 bosses in 36:10. 3 players.</p>`+
			`<h2>Bosses killed</h2><ul><li>Lucifron in 1:23</li><li>Magmadar in 1:35</li><li>Gehennas in 1:10</li></ul>`+
			`<h2>Players</h2><ul>`+
			`<li><a href="/armory/Normal-EU/0x0000000000000003">Mystery</a></li>`+
			`<li><a href="/armory/Normal-EU/0x00001B230029F685">Zeezee</a> (Warlock)</li>`+
			`<li><a href="/armory/Normal-EU/0x0000000000000002">Brick</a> (Warrior)</li>`+
			`</ul>`, html)
	}
}

func TestInstanceSummaryWithoutGuildOrFullClear(t *testing.T) {
	t.Parallel()
	store := testStore()
	store.instance.GuildID = uuid.NullUUID{}
	store.instance.GuildName = pgtype.Text{}
	store.instance.RealmName = "Realm With Spaces"
	store.encounters = append(store.encounters, encounter("Ragnaros", true, database.KillTypeWipe, 120, 200))

	description, html, ok := summary(t, store, "/instances/"+store.instance.ID.String())
	require.True(t, ok)
	require.Equal(t, "Molten Core run on Mar 4, 2026: 3/4 bosses in 2:03:20. Damage, healing and deaths for 3 players.", description)
	require.Contains(t, html, `<h1>Molten Core</h1><p>Molten Core run on Mar 4, 2026: 3/4 bosses in 2:03:20. 3 players.</p>`)
	require.NotContains(t, html, "/g/")
	require.Contains(t, html, `href="/armory/Realm%20With%20Spaces/0x0000000000000002"`)
}

func TestInstanceSummaryEscapesNames(t *testing.T) {
	t.Parallel()
	store := testStore()
	store.instance.GuildName = pgtype.Text{String: `<script>alert(1)</script>`, Valid: true}
	store.players[0].Name = `"><img src=x>`

	_, html, ok := summary(t, store, "/instances/"+store.instance.ID.String())
	require.True(t, ok)
	require.NotContains(t, html, "<script>")
	require.NotContains(t, html, "<img")
	require.Contains(t, html, "&lt;script&gt;")
}

func TestCharacterSummary(t *testing.T) {
	t.Parallel()
	store := testStore()
	guildHref := "/g/" + store.character.GuildID.UUID.String()

	for _, realm := range []string{"Normal-EU", store.realm.ID.String()} {
		description, html, ok := summary(t, store, "/armory/"+realm+"/0x00001B230029F685")
		require.True(t, ok)
		require.Equal(t, "Zeezee, level 60 Gnome Warlock of <Hand of Ragnaros>. Recent raids: Molten Core, Onyxia's Lair. Raid logs and performance on Chronicle.", description)
		require.Equal(t, `<h1>Zeezee</h1>`+
			`<p>Zeezee, level 60 Gnome Warlock on Normal-EU, member of <a href="`+guildHref+`">Hand of Ragnaros</a>.</p>`+
			`<h2>Recent raids and instances</h2><ul>`+
			`<li><a href="/instances/dQ2x2_bgihG2_kUf">Molten Core</a> on Mar 4, 2026</li>`+
			`<li><a href="/instances/6f9619ff-8b86-d011-b42d-00cf4fc964ff">Onyxia&#39;s Lair</a> on Mar 3, 2026</li>`+
			`<li><a href="/instances/`+store.recent[2].ID.String()+`">Molten Core</a> on Feb 25, 2026</li>`+
			`</ul>`, html)
	}
}

func TestCharacterSummaryOmitsUnknownFields(t *testing.T) {
	t.Parallel()
	store := testStore()
	store.character.Level = 0
	store.character.Race = database.WowPlayableRaceUnknown
	store.character.Class = database.WowPlayableClassUNKNOWN
	store.character.GuildID = uuid.NullUUID{}
	store.character.GuildName = pgtype.Text{}
	store.recent = nil

	description, html, ok := summary(t, store, "/armory/Normal-EU/0x00001B230029F685")
	require.True(t, ok)
	require.Equal(t, "Zeezee. Raid logs and performance on Chronicle.", description)
	require.Equal(t, `<h1>Zeezee</h1><p>Zeezee on Normal-EU.</p>`, html)
	require.NotContains(t, description+html, "Unknown")
}

func TestCharacterSummaryClassAndRaceNames(t *testing.T) {
	t.Parallel()
	store := testStore()
	store.character.Race = database.WowPlayableRaceScourge
	store.character.Class = database.WowPlayableClassDEATHKNIGHT

	description, _, ok := summary(t, store, "/armory/Normal-EU/0x00001B230029F685")
	require.True(t, ok)
	require.Contains(t, description, "level 60 Undead Death Knight")
}

func TestSummaryUnresolvedPages(t *testing.T) {
	t.Parallel()
	store := testStore()

	for _, path := range []string{
		"/",
		"/instances",
		"/instances/unlisted-or-missing",
		"/instances/" + uuid.NewString(),
		"/instances/dQ2x2_bgihG2_kUf/extra",
		"/armory/Normal-EU",
		"/armory/Other-Realm/0x00001B230029F685",
		"/armory/Normal-EU/0x0000000000000099",
		"/g/" + uuid.NewString(),
	} {
		_, _, ok := summary(t, store, path)
		require.False(t, ok, path)
	}
	_, _, ok := summary(t, nil, "/instances/dQ2x2_bgihG2_kUf")
	require.False(t, ok, "nil store")
}
