package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

func TestClearCardParams(t *testing.T) {
	t.Parallel()

	wipes, players, realmRank, delta := 0, 40, 1, -64
	raid := raidCard{
		Host:    "forever.chronicleclassic.com",
		Guild:   "Nightfall",
		Raid:    "Molten Core",
		Realm:   "Nordanaar",
		Players: &players,
		Wipes:   &wipes,
		Top:     []raidCardDPS{{Name: "Thalendris", Class: "mage", DPS: 1284}}, // not on the clear card
	}
	sr := clearCard{
		DurationMs: 2092000, Score: 98, Rank: 6, Of: 318, RealmRank: &realmRank, DeltaSecs: &delta,
		Splits: []clearCardSplit{
			{"Lucifron", 212}, {"Magmadar", 188}, {"Gehennas", 141}, {"Garr", 236}, {"Shazzrah", 120},
			{"Geddon", 195}, {"Sulfuron", 160}, {"Golemagg", 244}, {"Majordomo", 301}, {"Ragnaros", 295},
		},
	}

	// The ticket's params contract (#1668), less what ogImageURL adds.
	require.Equal(t, url.Values{
		"host":      {"forever.chronicleclassic.com"},
		"guild":     {"Nightfall"},
		"raid":      {"Molten Core"},
		"realm":     {"Nordanaar"},
		"ms":        {"2092000"},
		"score":     {"98"},
		"rank":      {"6"},
		"of":        {"318"},
		"realmrank": {"1"},
		"delta":     {"-64"},
		"wipes":     {"0"},
		"players":   {"40"},
		"splits":    {"Lucifron:212,Magmadar:188,Gehennas:141,Garr:236,Shazzrah:120,Geddon:195,Sulfuron:160,Golemagg:244,Majordomo:301,Ragnaros:295"},
	}, clearCardParams(raid, sr))

	base, err := url.Parse("https://og.example.com/")
	require.NoError(t, err)
	params := clearCardParams(raid, sr)
	signed, err := url.Parse(signedOGImageURL(base, "k", "clear", params.Get("host"), "WoW Forever", params))
	require.NoError(t, err)
	q := signed.Query()
	require.Equal(t, "clear", q.Get("template"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, "1", q.Get("realmrank"))
	require.NotEmpty(t, q.Get("sig"))

	// Top N% fallback: no realm rank, no delta, no wipes/players lookups.
	require.Equal(t, url.Values{
		"host": {"h"}, "raid": {"Molten Core"}, "ms": {"4000000"}, "score": {"93"}, "rank": {"20"}, "of": {"300"},
	}, clearCardParams(raidCard{Host: "h", Raid: "Molten Core"}, clearCard{DurationMs: 4000000, Score: 93, Rank: 20, Of: 300}))
}

func boardRow(guild uuid.UUID, ms int64, completed time.Time) database.SpeedrunLeaderboardRow {
	return database.SpeedrunLeaderboardRow{
		InstanceID:     uuid.New(),
		GuildID:        uuid.NullUUID{UUID: guild, Valid: true},
		DurationMs:     ms,
		CompletionTime: database.Timestamptz(completed),
	}
}

func TestClearRealmRank(t *testing.T) {
	t.Parallel()

	now := time.Now()
	self := clearSelf{instanceID: uuid.New(), durationMs: 2000, start: now}
	rows := []database.SpeedrunLeaderboardRow{
		boardRow(uuid.New(), 1500, now), boardRow(uuid.New(), 1800, now), boardRow(uuid.New(), 2000, now), boardRow(uuid.New(), 2500, now),
	}

	rank, ok := clearRealmRank(rows, self, 100)
	require.True(t, ok)
	require.Equal(t, 3, rank, "two faster runs; a tie doesn't push it down")

	rank, ok = clearRealmRank(rows[2:], self, 100)
	require.True(t, ok)
	require.Equal(t, 1, rank)

	// Its own row, or a faster duplicate upload of it, doesn't count.
	group := uuid.New()
	dupSelf := self
	dupSelf.duplicateGroup = uuid.NullUUID{UUID: group, Valid: true}
	dup := boardRow(uuid.New(), 1900, now)
	dup.DuplicateGroupID = uuid.NullUUID{UUID: group, Valid: true}
	own := boardRow(uuid.New(), 2000, now)
	own.InstanceID = self.instanceID
	rank, ok = clearRealmRank([]database.SpeedrunLeaderboardRow{dup, own}, dupSelf, 100)
	require.True(t, ok)
	require.Equal(t, 1, rank)

	// Placing below a full capped board: unknown.
	_, ok = clearRealmRank(rows[:2], self, 2)
	require.False(t, ok)
	rank, ok = clearRealmRank(rows[:3], self, 3)
	require.True(t, ok, "a tie within the cap still places")
	require.Equal(t, 3, rank)
	_, ok = clearRealmRank(nil, self, 100)
	require.True(t, ok, "first run on the board")
}

func TestClearRecordDelta(t *testing.T) {
	t.Parallel()

	start := time.Now()
	us, them := uuid.New(), uuid.New()
	self := clearSelf{instanceID: uuid.New(), guildID: us, durationMs: 2_092_000, start: start}
	board := []database.SpeedrunLeaderboardRow{
		boardRow(us, 2_092_000, start.Add(time.Hour)), // our best: this run
		boardRow(them, 2_190_000, start.Add(-72*time.Hour)),
	}
	board[0].InstanceID = self.instanceID
	own := []clearPastRun{
		{durationMs: 2_156_400, completed: start.Add(-7 * 24 * time.Hour)}, // the record it broke
		{durationMs: 2_090_000, completed: start.Add(time.Second)},         // a duplicate upload finishing with it
	}

	t.Run("exact", func(t *testing.T) {
		t.Parallel()
		delta := clearRecordDelta(board, own, self, 100)
		require.NotNil(t, delta)
		require.Equal(t, -64, *delta, "vs the guild's own earlier run, not the other guild's")
		delta = clearRecordDelta(board, nil, self, 100)
		require.NotNil(t, delta)
		require.Equal(t, -98, *delta, "only the other guild's run is earlier")
	})

	t.Run("another guild's best finished later and beats the previous record", func(t *testing.T) {
		t.Parallel()
		// That guild may have had an unseen earlier run that was the record.
		later := append(slices.Clone(board), boardRow(uuid.New(), 2_120_000, start.Add(24*time.Hour)))
		require.Nil(t, clearRecordDelta(later, own, self, 100))
		// A later best slower than the previous record can't hide one faster.
		slower := append(slices.Clone(board), boardRow(uuid.New(), 2_300_000, start.Add(24*time.Hour)))
		require.NotNil(t, clearRecordDelta(slower, own, self, 100))
	})

	t.Run("full board ends faster than the previous record", func(t *testing.T) {
		t.Parallel()
		// A run past the cap could be faster than the previous record: with
		// only this run on a full one-row board, the guild's 35:56 isn't
		// provably the record.
		require.Nil(t, clearRecordDelta(board[:1], own, self, 1))
		delta := clearRecordDelta(board[:1], own, self, 2)
		require.NotNil(t, delta, "board not full")
		require.Equal(t, -64, *delta)
		require.NotNil(t, clearRecordDelta(board, nil, self, 2), "full, but the previous record is its last row")
	})

	t.Run("no delta", func(t *testing.T) {
		t.Parallel()
		require.Nil(t, clearRecordDelta(board[:1], nil, self, 100), "no earlier run: first record")
		require.Nil(t, clearRecordDelta(nil, []clearPastRun{{durationMs: 2_092_200, completed: start.Add(-time.Hour)}}, self, 100), "under half a second")
		require.Nil(t, clearRecordDelta(nil, []clearPastRun{{durationMs: 2_000_000, completed: start.Add(-time.Hour)}}, self, 100), "slower than the record")
		require.Nil(t, clearRecordDelta(board, own, clearSelf{durationMs: 1}, 100), "no start time")
	})
}

func encounter(name string, kill database.KillType, end time.Time) database.LogInstanceEncounter {
	return database.LogInstanceEncounter{
		Name: name, Boss: true, KillType: kill,
		StartTime: database.Timestamptz(end.Add(-time.Minute)), EndTime: database.Timestamptz(end),
	}
}

func TestClearSplits(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 11, 6, 20, 0, 0, 0, time.UTC)
	at := func(secs int) time.Time { return start.Add(time.Duration(secs) * time.Second) }
	encounters := []database.LogInstanceEncounter{
		encounter("Bloodlord Mandokir", database.KillTypeClean, at(500)),
		encounter("High Priestess Jeklik", database.KillTypeClean, at(200)),
		encounter("Gahz'ranka", database.KillTypeClean, at(300)), // optional
		encounter("Hakkar", database.KillTypeWipe, at(700)),
		encounter("Hakkar", database.KillTypePartial, at(900)),
		encounter("Hakkar", database.KillTypeClean, at(1000)), // killed twice: first kill counts
		{Name: "Trash", KillType: database.KillTypeClean, EndTime: database.Timestamptz(at(100))},
	}
	progression := []string{"High Priestess Jeklik", "Bloodlord Mandokir", "Hakkar", "High Priestess Arlokk"}
	done := at(900)

	require.Equal(t, []clearCardSplit{{"Jeklik", 200}, {"Mandokir", 300}, {"Hakkar", 400}}, clearSplits(encounters, progression, start, done))

	// Without a registry list every boss kill in the window counts.
	require.Equal(t, []clearCardSplit{{"Jeklik", 200}, {"Gahz'ranka", 100}, {"Mandokir", 200}, {"Hakkar", 400}}, clearSplits(encounters, nil, start, done))

	// No start time: the first split is unknown (0), the rest still add up.
	require.Equal(t, []clearCardSplit{{"Jeklik", 0}, {"Mandokir", 300}, {"Hakkar", 400}}, clearSplits(encounters, progression, time.Time{}, done))

	t.Run("ZG: Arlokk after Hakkar runs past the completion", func(t *testing.T) {
		t.Parallel()
		// Only Mandokir, Jin'do and Hakkar are required, so the clear ends at
		// Hakkar; a later Arlokk kill adds no segment and doesn't take the
		// final label.
		withArlokk := append(slices.Clone(encounters), encounter("High Priestess Arlokk", database.KillTypeClean, at(1200)))
		splits := clearSplits(withArlokk, progression, start, done)
		require.Equal(t, []clearCardSplit{{"Jeklik", 200}, {"Mandokir", 300}, {"Hakkar", 400}}, splits)
		total := 0
		for _, split := range splits {
			total += split.Secs
		}
		require.Equal(t, 900, total, "splits add up to the timer")
	})

	t.Run("a kill at or before the ranked start is dropped", func(t *testing.T) {
		t.Parallel()
		// Ranked timing starts after the first boss (Ulduar starts after
		// Flame Leviathan): no pre-run time bleeds into the next split.
		ranked := at(250)
		require.Equal(t, []clearCardSplit{{"Mandokir", 250}, {"Hakkar", 400}}, clearSplits(encounters, progression, ranked, done))
		require.Equal(t, []clearCardSplit{{"Mandokir", 300}, {"Hakkar", 400}}, clearSplits(encounters, progression, at(200), done), "a kill exactly at the start")
	})
}

func TestOGSplitName(t *testing.T) {
	t.Parallel()

	for name, want := range map[string]string{
		"Lucifron":                 "Lucifron",
		"Baron Geddon":             "Baron Geddon", // 12 characters: kept whole
		"Majordomo Executus":       "Majordomo",
		"Golemagg the Incinerator": "Golemagg",
		"Sulfuron Harbinger":       "Sulfuron",
		"High Priestess Mar'li":    "Mar'li",
		"Jin'do the Hexxer":        "Jin'do",
		"Razorgore the Untamed":    "Razorgore",
		"Broodlord Lashlayer":      "Lashlayer",
		"Odd:Name,Here":            "Odd",
		// AQ40
		"The Prophet Skeram":        "Skeram",
		"Bug Family":                "Bug Family",
		"Bug Family: Vem":           "Bug Family",
		"Battleguard Sartura":       "Sartura",
		"Fankriss the Unyielding":   "Fankriss",
		"Princess Huhuran":          "Huhuran",
		"Twin Emperors":             "Twins",
		"Twin Emperors: Vek'nilash": "Twins",
		"C'Thun":                    "C'Thun",
		// Turtle: Karazhan, Emerald Sanctum
		"Lord Blackwald II":      "Blackwald",
		"Keeper Gnarlmoon":       "Gnarlmoon",
		"Ley-Watcher Incantagos": "Incantagos",
		"Echo of Medivh":         "Medivh",
		"Brood Queen Araxxna":    "Araxxna",
		"Clawlord Howlfang":      "Howlfang",
		"Sanv Tas'dal":           "Sanv Tas'dal",
		"Rupturan the Broken":    "Rupturan",
		"Solnius the Awakener":   "Solnius",
	} {
		require.Equal(t, want, ogSplitName(name), name)
	}
}

// slowBoardStore never answers the leaderboard before its deadline.
type slowBoardStore struct{ database.Store }

func (slowBoardStore) SpeedrunLeaderboard(ctx context.Context, _ database.SpeedrunLeaderboardParams) ([]database.SpeedrunLeaderboardRow, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

// unlistedStore reports every log group as unlisted.
type unlistedStore struct{ database.Store }

func (unlistedStore) GetWoWLogGroupUnlisted(context.Context, uuid.UUID) (bool, error) {
	return true, nil
}

// tenantStore serves a tenant's parse config and the root (Nil-tenant)
// time-parse score, so the parse-disabled check is what decides.
type tenantStore struct {
	database.Store
	parseConfig []byte
}

func (s tenantStore) GetTenantByID(_ context.Context, id uuid.UUID) (database.Tenant, error) {
	return database.Tenant{ID: id, ParseConfig: s.parseConfig}, nil
}

func (s tenantStore) GetTimeParseScoreForContract(ctx context.Context, arg database.GetTimeParseScoreForContractParams) (database.TimeParseScore, error) {
	arg.TenantID = uuid.Nil
	return s.Store.GetTimeParseScoreForContract(ctx, arg)
}

// failingSpeedrunStore fails the speedrun lookup.
type failingSpeedrunStore struct{ database.Store }

func (failingSpeedrunStore) GetInstanceSpeedrun(context.Context, uuid.UUID) (database.GetInstanceSpeedrunRow, error) {
	return database.GetInstanceSpeedrunRow{}, errors.New("boom")
}

type clearFixture struct {
	store database.Store
	inst  database.LogInstancesGuild // the shared run: 34:52, a new realm record
	low   database.LogInstancesGuild // qualified, time-parse 85
	slow  database.LogInstancesGuild // qualified, not computed
	pug   database.LogInstancesGuild // qualified, no guild, time-parse 95
	lowc  database.LogInstancesGuild // qualified, low_confidence time-parse 92
	hide  database.LogInstancesGuild // qualified, time-parse 96, log group unlisted
}

// seedClearCard stores three qualified Molten Core runs on one realm: the
// guild's earlier record (35:56), another guild's run (36:30), and the shared
// run (34:52) with a server clear-time parse of 98 (#6 of 318). A fourth run
// has a time-parse of 85, a fifth has none; a guildless run, a low-confidence
// one and an unlisted one follow.
func seedClearCard(t *testing.T) clearFixture {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID, realmID := uuid.New(), uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	if err == nil {
		_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	}
	if err == nil {
		_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "clear-card-realm")
	}
	conn.Release()
	require.NoError(t, err)

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "test-user"})
	require.NoError(t, err)
	nightfall, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Nightfall", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)
	other, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Other", CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)

	day := time.Date(2026, 11, 6, 20, 0, 0, 0, time.UTC)
	insertRun := func(guildID uuid.UUID, start time.Time, secs int, kills bool) database.LogInstancesGuild {
		t.Helper()
		logGroupID, instanceID := uuid.New(), uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
			CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
		end := start.Add(time.Duration(secs) * time.Second)
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logGroupID, GuildID: uuid.NullUUID{UUID: guildID, Valid: guildID != uuid.Nil},
			Name: "Molten Core", Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(end),
		})
		require.NoError(t, err)
		if kills {
			for i, name := range []string{"Lucifron", "Ragnaros"} {
				killed := start.Add(time.Duration((i+1)*secs/2) * time.Second)
				_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
					ID: uuid.New(), InstanceID: instanceID, Name: name, KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
					StartTime: database.Timestamptz(killed.Add(-time.Minute)), EndTime: database.Timestamptz(killed),
				})
				require.NoError(t, err)
			}
		}
		ms := int64(secs) * 1000
		require.NoError(t, store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: instanceID, InstanceName: "Molten Core", RealmID: realmID, GuildID: uuid.NullUUID{UUID: guildID, Valid: guildID != uuid.Nil},
			Qualified: true, StartTime: database.Timestamptz(start), CompletionTime: database.Timestamptz(end), DurationMs: ms,
			RankedStartTime: database.Timestamptz(start), RankedCompletionTime: database.Timestamptz(end),
			RankedDurationMs: pgtype.Int8{Int64: ms, Valid: true}, Proof: []byte(`{"proof":[]}`),
		}))
		inst, err := store.PublicInstance(ctx, instanceID)
		require.NoError(t, err)
		return inst
	}
	scoreWith := func(inst database.LogInstancesGuild, display int16, rank, of int32, statusName timeparsepolicy.Status) {
		t.Helper()
		ms := pgtype.Int8{Int64: 1, Valid: true}
		status := pgtype.Text{String: string(statusName), Valid: true}
		_, err := store.InsertTimeParseScore(ctx, database.InsertTimeParseScoreParams{
			TenantID: uuid.Nil, InstanceID: inst.ID, RunID: inst.ID, LogGroupID: uuid.NullUUID{UUID: inst.LogGroupID, Valid: true},
			RealmID: realmID, ClearDurationMs: ms,
			ClearServerPreciseScore: pgtype.Float8{Float64: float64(display), Valid: true}, ClearServerDisplayScore: pgtype.Int2{Int16: display, Valid: true},
			ClearServerRank: pgtype.Int4{Int32: rank, Valid: true}, ClearServerSampleSize: pgtype.Int4{Int32: of, Valid: true}, ClearServerStatus: status,
			ClearRealmPreciseScore: pgtype.Float8{Float64: float64(display), Valid: true}, ClearRealmDisplayScore: pgtype.Int2{Int16: display, Valid: true},
			ClearRealmRank: pgtype.Int4{Int32: 1, Valid: true}, ClearRealmSampleSize: pgtype.Int4{Int32: 3, Valid: true}, ClearRealmStatus: status,
			Cutoff: database.Timestamptz(day), WindowStart: database.Timestamptz(day.AddDate(0, 0, -60)),
			LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: timeparsepolicy.QueryVersion,
		})
		require.NoError(t, err)
	}
	score := func(inst database.LogInstancesGuild, display int16, rank, of int32) {
		t.Helper()
		scoreWith(inst, display, rank, of, timeparsepolicy.StatusOK)
	}

	insertRun(nightfall.ID, day.AddDate(0, 0, -7), 2156, false) // 35:56, the previous record
	insertRun(other.ID, day.AddDate(0, 0, -3), 2190, false)     // 36:30
	inst := insertRun(nightfall.ID, day, 2092, true)            // 34:52
	score(inst, 98, 6, 318)
	low := insertRun(other.ID, day.AddDate(0, 0, 1), 2400, false)
	score(low, 85, 40, 318)
	slow := insertRun(other.ID, day.AddDate(0, 0, 2), 2500, false)
	pug := insertRun(uuid.Nil, day.AddDate(0, 0, 3), 2300, false)
	score(pug, 95, 9, 318)
	lowc := insertRun(other.ID, day.AddDate(0, 0, 4), 2600, false)
	scoreWith(lowc, 92, 15, 318, timeparsepolicy.StatusLowConfidence)
	hide := insertRun(nightfall.ID, day.AddDate(0, 0, 5), 2700, false)
	score(hide, 96, 8, 318)
	_, err = store.MarkWoWLogGroupUnlisted(ctx, hide.LogGroupID)
	require.NoError(t, err)
	return clearFixture{store: store, inst: inst, low: low, slow: slow, pug: pug, lowc: lowc, hide: hide}
}

func TestLoadClearCard(t *testing.T) {
	t.Parallel()
	f := seedClearCard(t)
	apiWith := func(s database.Store) *API {
		return &API{Opts: &Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s)}}
	}
	request := func(ctx context.Context) *http.Request {
		return httptest.NewRequest(http.MethodGet, "/instances/x", nil).WithContext(ctx)
	}
	encounters := func(inst database.LogInstancesGuild) []database.LogInstanceEncounter {
		ctx := testutil.Context(t, testutil.WaitShort)
		e, err := f.store.EncountersByInstanceID(ctx, inst.ID)
		require.NoError(t, err)
		return e
	}

	t.Run("new realm record", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		card, ok := apiWith(f.store).loadClearCard(request(ctx), f.inst, encounters(f.inst))
		require.True(t, ok)
		require.EqualValues(t, 2092000, card.DurationMs)
		require.Equal(t, 98, card.Score)
		require.Equal(t, 6, card.Rank)
		require.Equal(t, 318, card.Of)
		require.NotNil(t, card.RealmRank)
		require.Equal(t, 1, *card.RealmRank)
		require.NotNil(t, card.DeltaSecs)
		require.Equal(t, -64, *card.DeltaSecs, "vs the guild's own earlier 35:56")
		require.Equal(t, []clearCardSplit{{"Lucifron", 1046}, {"Ragnaros", 1046}}, card.Splits)
	})

	t.Run("time-parse below 90 keeps the raid card", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		_, ok := apiWith(f.store).loadClearCard(request(ctx), f.low, nil)
		require.False(t, ok)
	})

	t.Run("time-parse not computed keeps the raid card", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		_, ok := apiWith(f.store).loadClearCard(request(ctx), f.slow, nil)
		require.False(t, ok)
	})

	t.Run("speedrun lookup fails", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		_, ok := apiWith(failingSpeedrunStore{f.store}).loadClearCard(request(ctx), f.inst, nil)
		require.False(t, ok)
	})

	t.Run("board times out: Top N% fallback", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		start := time.Now()
		card, ok := apiWith(slowBoardStore{f.store}).loadClearCard(request(ctx), f.inst, nil)
		require.Less(t, time.Since(start), clearCardTimeout+time.Second)
		require.True(t, ok)
		require.Equal(t, 98, card.Score)
		require.Nil(t, card.RealmRank)
		require.Nil(t, card.DeltaSecs)
	})

	t.Run("parse-disabled tenant keeps the raid card", func(t *testing.T) {
		t.Parallel()
		ctx := servicetenant.WithTenantID(testutil.Context(t, testutil.WaitShort), uuid.New())
		_, ok := apiWith(tenantStore{Store: f.store, parseConfig: []byte(`{"cohort_mode":"disabled"}`)}).loadClearCard(request(ctx), f.inst, nil)
		require.False(t, ok)
		// The same tenant with parses on gets the clear card.
		_, ok = apiWith(tenantStore{Store: f.store, parseConfig: []byte(`{"cohort_mode":"spec"}`)}).loadClearCard(request(ctx), f.inst, nil)
		require.True(t, ok)
	})

	t.Run("no guild: Top N% fallback", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		card, ok := apiWith(f.store).loadClearCard(request(ctx), f.pug, nil)
		require.True(t, ok)
		require.Equal(t, 95, card.Score)
		require.Nil(t, card.RealmRank)
		require.Nil(t, card.DeltaSecs)
	})

	t.Run("low_confidence time-parse qualifies", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		card, ok := apiWith(f.store).loadClearCard(request(ctx), f.lowc, nil)
		require.True(t, ok)
		require.Equal(t, 92, card.Score)
		require.NotNil(t, card.RealmRank)
		require.Equal(t, 3, *card.RealmRank, "behind Nightfall's 34:52 and its own guild's 36:30")
	})

	t.Run("unlisted log group", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		// The stored score isn't served for an unlisted log group: raid card.
		_, ok := apiWith(f.store).loadClearCard(request(ctx), f.hide, nil)
		require.False(t, ok)
		// With a score, an unlisted run gets no realm rank or delta.
		card, ok := apiWith(unlistedStore{f.store}).loadClearCard(request(ctx), f.inst, nil)
		require.True(t, ok)
		require.Equal(t, 98, card.Score)
		require.Nil(t, card.RealmRank)
		require.Nil(t, card.DeltaSecs)
	})

	t.Run("canceled request", func(t *testing.T) {
		t.Parallel()
		ctx, cancel := context.WithCancel(testutil.Context(t, testutil.WaitShort))
		cancel()
		start := time.Now()
		_, ok := apiWith(f.store).loadClearCard(request(ctx), f.inst, nil)
		require.Less(t, time.Since(start), clearCardTimeout)
		require.False(t, ok)
	})
}
