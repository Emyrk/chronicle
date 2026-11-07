package api

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

func TestParseCardParams(t *testing.T) {
	t.Parallel()

	score, rank, of := 99, 3, 1412
	card := parseCard{
		Host:     "forever.chronicleclassic.com",
		Player:   "Thalendris",
		Class:    "mage",
		Spec:     "Fire",
		Boss:     "Ragnaros",
		Raid:     "Molten Core",
		Guild:    "Nightfall",
		Realm:    "Nordanaar",
		Metric:   "dps",
		Value:    1284.62,
		Duration: 134 * time.Second,
		Score:    &score,
		Rank:     &rank,
		Of:       &of,
		RaidRank: 1,
	}
	// The ticket's params contract; product, template and v come from the signer.
	require.Equal(t, url.Values{
		"host":     {"forever.chronicleclassic.com"},
		"player":   {"Thalendris"},
		"class":    {"mage"},
		"spec":     {"Fire"},
		"boss":     {"Ragnaros"},
		"raid":     {"Molten Core"},
		"guild":    {"Nightfall"},
		"realm":    {"Nordanaar"},
		"metric":   {"dps"},
		"value":    {"1284.6"},
		"dur":      {"134"},
		"score":    {"99"},
		"rank":     {"3"},
		"of":       {"1412"},
		"raidrank": {"1"},
	}, parseCardParams(card))

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	params := parseCardParams(card)
	signed, err := url.Parse(signedOGImageURL(base, "k", "parse", params.Get("host"), "WoW Forever", params))
	require.NoError(t, err)
	q := signed.Query()
	require.Equal(t, "parse", q.Get("template"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, "1", q.Get("v"))
	require.Equal(t, "99", q.Get("score"))
	require.NotEmpty(t, q.Get("sig"))

	// DPS-hero fallback: no parse → no score, rank or of; a healer reads hps.
	card.Score, card.Rank, card.Of = nil, nil, nil
	card.Metric = "hps"
	params = parseCardParams(card)
	for _, key := range []string{"score", "rank", "of"} {
		require.False(t, params.Has(key), key)
	}
	require.Equal(t, "hps", params.Get("metric"))
	require.Equal(t, "1", params.Get("raidrank"))
}

func TestShareParseSelection(t *testing.T) {
	t.Parallel()

	encounters := []database.LogInstanceEncounter{
		{ID: uuid.New(), Name: "Lucifron", Boss: true, KillType: database.KillTypeClean},
		{ID: uuid.New(), Name: "Trash", Boss: false},
		{ID: uuid.New(), Name: "Ragnaros", Boss: true, KillType: database.KillTypeWipe},
		{ID: uuid.New(), Name: "Ragnaros", Boss: true, KillType: database.KillTypeClean},
	}
	// Sorted by 0x%016X GUID string: 0x…0A (Alpha), 0x…0B (Bravo), 0x…10 (Charlie).
	players := []database.LogInstancePlayer{
		{UnitGuid: guid.GUID(0x10), Name: "Charlie"},
		{UnitGuid: guid.GUID(0x0A), Name: "Alpha"},
		{UnitGuid: guid.GUID(0x0B), Name: "Bravo"},
	}

	player, enc, ok := shareParseSelection([]byte(`{"version":2,"view":{"encounters":"3","players":[2]}}`), encounters, players)
	require.True(t, ok)
	require.Equal(t, "Charlie", player.Name)
	require.Equal(t, encounters[3].ID, enc.ID)

	player, enc, ok = shareParseSelection([]byte(`{"view":{"encounters":"0","players":[0,0]}}`), encounters, players)
	require.True(t, ok, "a repeated index is one player")
	require.Equal(t, "Alpha", player.Name)
	require.Equal(t, "Lucifron", enc.Name)

	for name, payload := range map[string]string{
		"SeveralPlayers": `{"view":{"encounters":"3","players":[0,1]}}`,
		"NoPlayers":      `{"view":{"encounters":"3","players":[]}}`,
		"SeveralBosses":  `{"view":{"encounters":"0-3","players":[0]}}`,
		"AllEncounters":  `{"view":{"encounters":"all","players":[0]}}`,
		"Trash":          `{"view":{"encounters":"1","players":[0]}}`,
		"Wipe":           `{"view":{"encounters":"2","players":[0]}}`,
		"OutOfRange":     `{"view":{"encounters":"9","players":[7]}}`,
		"NoView":         `{"version":2}`,
		"NotJSON":        `nope`,
	} {
		_, _, ok := shareParseSelection([]byte(payload), encounters, players)
		require.False(t, ok, name)
	}
}

func TestRaidMetricRank(t *testing.T) {
	t.Parallel()

	enc := database.LogInstanceEncounter{ID: uuid.New()}
	other := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	this := uuid.NullUUID{UUID: enc.ID, Valid: true}
	records := []database.EncounterDpsRanking{
		{EncounterID: this, PlayerGuid: "a", Dps: 900, Hps: 10},
		{EncounterID: this, PlayerGuid: "b", Dps: 1200, Hps: 0},
		{EncounterID: this, PlayerGuid: "c", Dps: 50, Hps: 800},
		// Another boss and trash don't count.
		{EncounterID: other, PlayerGuid: "x", Dps: 5000, Hps: 5000},
		{PlayerGuid: "y", Dps: 5000, Hps: 5000},
	}

	value, rank := raidMetricRank(records, enc, "a", false)
	require.InDelta(t, 900, value, 0.001)
	require.Equal(t, 2, rank)
	value, rank = raidMetricRank(records, enc, "c", true)
	require.InDelta(t, 800, value, 0.001)
	require.Equal(t, 1, rank)
	value, rank = raidMetricRank(records, enc, "b", true)
	require.Zero(t, value, "no HPS")
	require.Zero(t, rank)
	_, rank = raidMetricRank(records, enc, "missing", false)
	require.Zero(t, rank)
}

// seedParseCard stores one Ragnaros kill with a fire mage (99 parse, #3 of
// 1412), a holy priest (HPS 80 parse) and a warrior with no parse, and
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
		Name: inst.Name, Capabilities: []string{}, StartTime: database.Timestamptz(now.Add(-time.Hour)),
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
		metric                  string
		score, rank, sampleSize int32
	}
	for _, s := range []seed{
		{guid.GUID(0x0A), "Thalendris", "MAGE", "Fire", "dps", 1284.6, 0, "dps", 99, 3, 1412},
		{guid.GUID(0x0B), "Lightwell", "PRIEST", "Holy", "heal", 0, 900, "hps", 80, 12, 300},
		{guid.GUID(0x0C), "Grimtusk", "WARRIOR", "Fury", "dps", 1300, 0, "dps", 40, 700, 1200},
	} {
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: enc.ID, Valid: true}, InstanceID: inst.ID,
			EncounterName: enc.Name, InstanceName: inst.Name,
			PlayerGuid: s.guid.String(), PlayerName: s.name, PlayerClass: s.class, PlayerSpec: s.spec, PlayerRole: s.role,
			DifficultyName: "Normal", MaxPlayers: 40, RealmID: realmID, RealmName: "Nordanaar",
			DamageDone: int64(s.dps * 134), HealingDone: int64(s.hps * 134), DurationSecs: 134, Dps: s.dps, Hps: s.hps,
			KilledAt: database.Timestamptz(now), LogHashedSlug: "slug",
		}))
		value := s.dps
		if s.metric == "hps" {
			value = s.hps
		}
		require.NoError(t, store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
			TenantID: uuid.Nil, InstanceID: inst.ID, RunID: inst.ID,
			EncounterName: enc.Name, PlayerGuid: s.guid.String(), PlayerName: s.name,
			PlayerClass: s.class, PlayerSpec: s.spec, PlayerRole: s.role,
			Metric: s.metric, MetricValue: value, PreciseScore: float64(s.score), DisplayScore: int16(s.score),
			Rank: s.rank, SampleSize: s.sampleSize, Status: "ok",
			InstanceName: inst.Name, DifficultyName: "Normal", MaxPlayers: 40, KilledAt: database.Timestamptz(now),
		}))
	}
	return store, inst, enc
}

// slowRankingStore never answers the ranking records lookup before its deadline.
type slowRankingStore struct{ database.Store }

func (slowRankingStore) InstanceRankingRecords(ctx context.Context, _ uuid.UUID) ([]database.EncounterDpsRanking, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestLoadParseCard(t *testing.T) {
	t.Parallel()

	store, inst, enc := seedParseCard(t)
	apiWith := func(s database.Store) *API {
		return &API{Opts: &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s)}}
	}
	request := func(ctx context.Context) *http.Request {
		return httptest.NewRequest(http.MethodGet, "/s/code", nil).WithContext(ctx)
	}
	base := parseCard{Host: "forever.chronicleclassic.com", Raid: "Molten Core", Realm: "Nordanaar"}
	load := func(t *testing.T, s database.Store, playerGUID guid.GUID) (parseCard, bool) {
		ctx := testutil.Context(t, testutil.WaitShort)
		return apiWith(s).loadParseCard(request(ctx), inst, database.LogInstancePlayer{UnitGuid: playerGUID}, enc, base)
	}

	t.Run("Parse", func(t *testing.T) {
		t.Parallel()
		card, ok := load(t, store, guid.GUID(0x0A))
		require.True(t, ok)
		require.Equal(t, url.Values{
			"host": {"forever.chronicleclassic.com"}, "player": {"Thalendris"}, "class": {"mage"}, "spec": {"Fire"},
			"boss": {"Ragnaros"}, "raid": {"Molten Core"}, "realm": {"Nordanaar"}, "metric": {"dps"},
			"value": {"1284.6"}, "dur": {"134"}, "score": {"99"}, "rank": {"3"}, "of": {"1412"}, "raidrank": {"2"},
		}, parseCardParams(card))
	})

	t.Run("HealerReadsHPS", func(t *testing.T) {
		t.Parallel()
		card, ok := load(t, store, guid.GUID(0x0B))
		require.True(t, ok)
		params := parseCardParams(card)
		require.Equal(t, "hps", params.Get("metric"))
		require.Equal(t, "900.0", params.Get("value"))
		require.Equal(t, "80", params.Get("score"))
		require.Equal(t, "1", params.Get("raidrank"))
	})

	t.Run("LowParseLeadsWithDPS", func(t *testing.T) {
		t.Parallel()
		card, ok := load(t, store, guid.GUID(0x0C))
		require.True(t, ok)
		params := parseCardParams(card)
		require.False(t, params.Has("score"), "40 < 75: DPS-hero fallback")
		require.False(t, params.Has("rank"))
		require.Equal(t, "1300.0", params.Get("value"))
		require.Equal(t, "1", params.Get("raidrank"))
	})

	t.Run("NoRecordFallsBack", func(t *testing.T) {
		t.Parallel()
		_, ok := load(t, store, guid.GUID(0xFF))
		require.False(t, ok)
	})

	t.Run("RecordsTimeOut", func(t *testing.T) {
		t.Parallel()
		start := time.Now()
		_, ok := load(t, slowRankingStore{store}, guid.GUID(0x0A))
		require.False(t, ok)
		require.Less(t, time.Since(start), raidCardTimeout+time.Second)
	})
}

// A share that selects one player and one boss kill gets the parse card; a
// fallback to the raid card stays under one raidCardTimeout budget.
func TestInstanceCardURL(t *testing.T) {
	t.Parallel()

	store, inst, enc := seedParseCard(t)
	ogURL, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	encounters := []database.LogInstanceEncounter{enc}
	players := []database.LogInstancePlayer{
		{UnitGuid: guid.GUID(0x0A), Name: "Thalendris", Class: database.WowPlayableClassMAGE},
		{UnitGuid: guid.GUID(0x0B), Name: "Lightwell", Class: database.WowPlayableClassPRIEST},
	}
	base := raidCard{Host: "forever.chronicleclassic.com", Raid: inst.Name, Realm: inst.RealmName}
	template := func(t *testing.T, s database.Store, payload []byte) url.Values {
		ctx := testutil.Context(t, testutil.WaitShort)
		r := httptest.NewRequest(http.MethodGet, "/s/code", nil).WithContext(ctx)
		a := &API{Opts: &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s), OGServiceURL: ogURL, OGSigningKey: "k"}}
		u, err := url.Parse(a.instanceCardURL(r, inst, encounters, players, nil, base, payload))
		require.NoError(t, err)
		return u.Query()
	}

	q := template(t, store, []byte(`{"view":{"encounters":"0","players":[0]}}`))
	require.Equal(t, "parse", q.Get("template"))
	require.Equal(t, "Thalendris", q.Get("player"))
	require.Equal(t, "99", q.Get("score"))

	require.Equal(t, "raid", template(t, store, []byte(`{"view":{"encounters":"0","players":[0,1]}}`)).Get("template"))
	require.Equal(t, "raid", template(t, store, nil).Get("template"), "the instance page itself")

	start := time.Now()
	q = template(t, slowRankingStore{store}, []byte(`{"view":{"encounters":"0","players":[0]}}`))
	require.Equal(t, "raid", q.Get("template"))
	require.Less(t, time.Since(start), raidCardTimeout+time.Second, "one budget for both cards")
}
