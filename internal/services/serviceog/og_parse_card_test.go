package serviceog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestBossShareCardParams(t *testing.T) {
	t.Parallel()

	card := bossShareCard{
		Host:     "forever.chronicleclassic.com",
		Boss:     "Ragnaros",
		Raid:     "Molten Core",
		Guild:    "Nightfall",
		Duration: 134 * time.Second,
		Top:      []raidCardDPS{{Name: "Grimtusk", Class: "warrior", DPS: 1300}},
		Heal:     []raidCardDPS{{Name: "Lightwell", Class: "priest", DPS: 900}},
	}
	// product, template and v come from the signer.
	require.Equal(t, url.Values{
		"host":  {"forever.chronicleclassic.com"},
		"boss":  {"Ragnaros"},
		"raid":  {"Molten Core"},
		"guild": {"Nightfall"},
		"dur":   {"134"},
		"top":   {"Grimtusk:warrior:1300"},
		"heal":  {"Lightwell:priest:900"},
	}, bossShareCardParams(card))

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	params := bossShareCardParams(card)
	signed, err := url.Parse(signedOGImageURL(base, "k", "parse", params.Get("host"), "WoW Forever", params))
	require.NoError(t, err)
	q := signed.Query()
	require.Equal(t, "parse", q.Get("template"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, "1", q.Get("v"))
	require.Equal(t, "Grimtusk:warrior:1300", q.Get("top"))
	require.NotEmpty(t, q.Get("sig"))

	// Only a top healer: no top param.
	card.Top = nil
	require.False(t, bossShareCardParams(card).Has("top"))
}

func TestShareBossSelection(t *testing.T) {
	t.Parallel()

	encounters := []database.LogInstanceEncounter{
		{ID: uuid.New(), Name: "Lucifron", Boss: true, KillType: database.KillTypeClean},
		{ID: uuid.New(), Name: "Trash", Boss: false},
		{ID: uuid.New(), Name: "Ragnaros", Boss: true, KillType: database.KillTypeWipe},
		{ID: uuid.New(), Name: "Ragnaros", Boss: true, KillType: database.KillTypeClean},
	}

	// Selected players don't matter: none, one or several.
	for name, payload := range map[string]string{
		"OnePlayer":      `{"version":2,"view":{"encounters":"3","players":[2]}}`,
		"SeveralPlayers": `{"view":{"encounters":"3","players":[0,1]}}`,
		"NoPlayers":      `{"view":{"encounters":"3","players":[]}}`,
		"NoPlayersKey":   `{"view":{"encounters":"3"}}`,
	} {
		enc, ok := shareBossSelection([]byte(payload), encounters)
		require.True(t, ok, name)
		require.Equal(t, encounters[3].ID, enc.ID, name)
	}

	for name, payload := range map[string]string{
		"SeveralBosses": `{"view":{"encounters":"0-3"}}`,
		"AllEncounters": `{"view":{"encounters":"all"}}`,
		"Trash":         `{"view":{"encounters":"1"}}`,
		"Wipe":          `{"view":{"encounters":"2"}}`,
		"OutOfRange":    `{"view":{"encounters":"9"}}`,
		"NoView":        `{"version":2}`,
		"NotJSON":       `nope`,
	} {
		_, ok := shareBossSelection([]byte(payload), encounters)
		require.False(t, ok, name)
	}
}

// seedParseCard stores one Ragnaros kill's ranking records: a fire mage
// (1284.6 DPS), a holy priest (900 HPS) and a warrior (1300 DPS, the top), and
// returns the store, instance and encounter.
func seedParseCard(t *testing.T) (database.Store, database.LogInstancesGuild, database.LogInstanceEncounter) {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID, realmID := uuid.New(), uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	// Released before any require can stop the test: a held connection
	// blocks the pool's cleanup.
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	if err == nil {
		_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "server-"+serverID.String())
	}
	if err == nil {
		_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "realm-"+realmID.String())
	}
	conn.Release()
	require.NoError(t, err)

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "user-" + userID.String()})
	require.NoError(t, err)
	now := time.Now()
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	inst := database.LogInstancesGuild{ID: uuid.New(), Name: "Molten Core", RealmName: "Nordanaar"}
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: inst.ID, RealmID: realmID, LogGroupID: logGroupID,
		Name: inst.Name, DifficultyName: "Normal", MaxPlayers: 40, Capabilities: []string{}, StartTime: database.Timestamptz(now.Add(-time.Hour)),
	})
	require.NoError(t, err)
	enc := database.LogInstanceEncounter{ID: uuid.New(), InstanceID: inst.ID, Name: "Ragnaros", Boss: true, KillType: database.KillTypeClean}
	_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID: enc.ID, InstanceID: inst.ID, Name: enc.Name, KillType: enc.KillType, Remaining: guid.GUIDs{}, Boss: true,
		StartTime: database.Timestamptz(now.Add(-134 * time.Second)), EndTime: database.Timestamptz(now),
	})
	require.NoError(t, err)

	type seed struct {
		guid                    guid.GUID
		name, class, spec, role string
		dps, hps                float64
	}
	for _, s := range []seed{
		{guid.GUID(0x0A), "Thalendris", "MAGE", "Fire", "dps", 1284.6, 0},
		{guid.GUID(0x0B), "Lightwell", "PRIEST", "Holy", "heal", 0, 900},
		{guid.GUID(0x0C), "Grimtusk", "WARRIOR", "Fury", "dps", 1300, 0},
	} {
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: enc.ID, Valid: true}, InstanceID: inst.ID,
			EncounterName: enc.Name, InstanceName: inst.Name,
			PlayerGuid: s.guid.String(), PlayerName: s.name, PlayerClass: s.class, PlayerSpec: s.spec, PlayerRole: s.role,
			DifficultyName: "Normal", MaxPlayers: 40, RealmID: realmID, RealmName: "Nordanaar",
			DamageDone: int64(s.dps * 134), HealingDone: int64(s.hps * 134), DurationSecs: 134, Dps: s.dps, Hps: s.hps,
			KilledAt: database.Timestamptz(now), LogHashedSlug: "slug",
		}))
	}
	return store, inst, enc
}

// slowRankingStore never answers the ranking records lookup before its deadline.
type slowRankingStore struct{ database.Store }

func (slowRankingStore) InstanceRankingRecords(ctx context.Context, _ uuid.UUID) ([]database.EncounterDpsRankingsResolved, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestLoadBossShareCard(t *testing.T) {
	t.Parallel()

	store, inst, enc := seedParseCard(t)
	base := bossShareCard{Host: "forever.chronicleclassic.com", Raid: "Molten Core"}
	load := func(t *testing.T, s database.Store, enc database.LogInstanceEncounter) (bossShareCard, bool) {
		ctx := testutil.Context(t, testutil.WaitShort)
		r := httptest.NewRequest(http.MethodGet, "/s/code", nil).WithContext(ctx)
		return New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s)}).loadBossShareCard(r, inst, enc, base)
	}

	t.Run("TopDPSAndHPS", func(t *testing.T) {
		t.Parallel()
		card, ok := load(t, store, enc)
		require.True(t, ok)
		require.Equal(t, url.Values{
			"host": {"forever.chronicleclassic.com"}, "boss": {"Ragnaros"}, "raid": {"Molten Core"}, "dur": {"134"},
			"top": {"Grimtusk:warrior:1300"}, "heal": {"Lightwell:priest:900"},
		}, bossShareCardParams(card))
	})

	t.Run("NoRankedPlayersFallsBack", func(t *testing.T) {
		t.Parallel()
		_, ok := load(t, store, database.LogInstanceEncounter{ID: uuid.New(), Name: "Golemagg", Boss: true})
		require.False(t, ok)
	})

	t.Run("RecordsTimeOut", func(t *testing.T) {
		t.Parallel()
		start := time.Now()
		_, ok := load(t, slowRankingStore{store}, enc)
		require.False(t, ok)
		require.Less(t, time.Since(start), raidCardTimeout+time.Second)
	})
}

// A share that selects one boss kill gets the boss share card whatever players
// it selects; a fallback to the raid card stays under one raidCardTimeout budget.
func TestInstanceCardURL(t *testing.T) {
	t.Parallel()

	store, inst, enc := seedParseCard(t)
	ogURL, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	encounters := []database.LogInstanceEncounter{enc}
	base := raidCard{Host: "forever.chronicleclassic.com", Raid: inst.Name}
	template := func(t *testing.T, s database.Store, payload []byte) url.Values {
		ctx := testutil.Context(t, testutil.WaitShort)
		r := httptest.NewRequest(http.MethodGet, "/s/code", nil).WithContext(ctx)
		a := New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s), OGServiceURL: ogURL, OGSigningKey: "k"})
		u, err := url.Parse(a.instanceCardURL(r, inst, encounters, base, payload))
		require.NoError(t, err)
		return u.Query()
	}

	for _, payload := range []string{
		`{"view":{"encounters":"0","players":[0]}}`,
		`{"view":{"encounters":"0","players":[0,1]}}`,
		`{"view":{"encounters":"0"}}`,
	} {
		q := template(t, store, []byte(payload))
		require.Equal(t, "parse", q.Get("template"), payload)
		require.Equal(t, "Ragnaros", q.Get("boss"), payload)
		require.Equal(t, "Grimtusk:warrior:1300", q.Get("top"), payload)
		require.False(t, q.Has("player"), payload)
		require.False(t, q.Has("score"), payload)
	}

	require.Equal(t, "raid", template(t, store, []byte(`{"view":{"encounters":"all","players":[0]}}`)).Get("template"))
	require.Equal(t, "raid", template(t, store, nil).Get("template"), "the instance page itself")

	start := time.Now()
	q := template(t, slowRankingStore{store}, []byte(`{"view":{"encounters":"0"}}`))
	require.Equal(t, "raid", q.Get("template"))
	require.Less(t, time.Since(start), raidCardTimeout+time.Second, "one budget for both cards")
}
