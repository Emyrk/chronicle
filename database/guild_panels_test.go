package database_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// guildPanelsFixture wires up the rows the guild panel queries join against:
// a realm, a guild, and a log instance for parse score FKs.
type guildPanelsFixture struct {
	pool       *pgxpool.Pool
	store      database.Store
	realmID    uuid.UUID
	guildID    uuid.UUID
	instanceID uuid.UUID
	logGroupID uuid.UUID
}

func setupGuildPanelsTest(t *testing.T) guildPanelsFixture {
	t.Helper()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "u-" + userID.String()[:8],
	})
	require.NoError(t, err)

	startedAt := time.Now().Add(-24 * time.Hour)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(startedAt), UpdatedAt: database.Timestamptz(startedAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", HashedSlug: pgtype.Text{String: "guild-panels-" + instanceID.String()[:8], Valid: true},
		StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)

	f := guildPanelsFixture{
		pool:       pool,
		store:      store,
		realmID:    realmID,
		instanceID: instanceID,
		logGroupID: logGroupID,
		guildID:    uuid.New(),
	}
	f.insertGuild(t, f.guildID, "Zug Zug")
	return f
}

func (f guildPanelsFixture) insertGuild(t *testing.T, id uuid.UUID, name string) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := f.pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", id, f.realmID, name)
	require.NoError(t, err)
}

type guildPanelPlayer struct {
	guid      string
	name      string
	class     string
	guildID   uuid.UUID
	level     int16
	updatedAt time.Time
}

func (f guildPanelsFixture) insertGamePlayer(t *testing.T, params guildPanelPlayer) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := f.pool.Exec(ctx, `
		INSERT INTO game_players (id, realm_id, guild_id, name, class, gender, race, level, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'Male', 'Orc', $6, $7)`,
		params.guid, f.realmID, params.guildID, params.name, params.class, params.level, params.updatedAt)
	require.NoError(t, err)
}

type guildPanelParse struct {
	runID      uuid.UUID
	guildID    uuid.NullUUID
	playerGUID string
	playerName string
	playerRole string // "dps", "heal", "tank"
	metric     string // "dps" or "hps"
	encounter  string
	score      float64
	killedAt   time.Time
}

func (f guildPanelsFixture) insertParse(t *testing.T, p guildPanelParse) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	guildID := p.guildID
	if !guildID.Valid {
		guildID = uuid.NullUUID{UUID: f.guildID, Valid: true}
	}
	require.NoError(t, f.store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID:       uuid.Nil,
		InstanceID:     f.instanceID,
		RunID:          p.runID,
		GuildID:        guildID,
		EncounterName:  p.encounter,
		PlayerGuid:     p.playerGUID,
		PlayerName:     p.playerName,
		PlayerClass:    "WARRIOR",
		PlayerSpec:     "Arms",
		PlayerRole:     p.playerRole,
		Metric:         p.metric,
		MetricValue:    p.score * 10,
		PreciseScore:   p.score,
		DisplayScore:   int16(p.score),
		Rank:           1,
		SampleSize:     50,
		Status:         "ok",
		InstanceName:   "Molten Core",
		DifficultyName: "Normal",
		MaxPlayers:     40,
		KilledAt:       database.Timestamptz(p.killedAt),
	}))
}

func testGUID(n int) string {
	return fmt.Sprintf("0x%016X", n)
}

func TestGuildCharacterRoster(t *testing.T) {
	t.Parallel()

	f := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	now := time.Now()
	runID := uuid.New()

	otherGuildID := uuid.New()
	f.insertGuild(t, otherGuildID, "Other Guild")

	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(1), name: "Activeguy", class: "WARRIOR", guildID: f.guildID, level: 60, updatedAt: now.Add(-24 * time.Hour)})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(2), name: "Healgirl", class: "PRIEST", guildID: f.guildID, level: 60, updatedAt: now.Add(-48 * time.Hour)})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(3), name: "Idleguy", class: "MAGE", guildID: f.guildID, level: 60, updatedAt: now.Add(-100 * 24 * time.Hour)})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(4), name: "Outsider", class: "ROGUE", guildID: otherGuildID, level: 60, updatedAt: now})

	// Activeguy (dps): two encounters at 80 and 60 -> avg 70. The hps row must
	// not contribute because his role is dps.
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(1), playerName: "Activeguy", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 80, killedAt: now.Add(-24 * time.Hour)})
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(1), playerName: "Activeguy", playerRole: "dps", metric: "dps", encounter: "Golemagg", score: 60, killedAt: now.Add(-24 * time.Hour)})
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(1), playerName: "Activeguy", playerRole: "dps", metric: "hps", encounter: "Ragnaros", score: 99, killedAt: now.Add(-24 * time.Hour)})
	// Healgirl (heal): her hps parses count, her dps parse does not.
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(2), playerName: "Healgirl", playerRole: "heal", metric: "hps", encounter: "Ragnaros", score: 90, killedAt: now.Add(-48 * time.Hour)})
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(2), playerName: "Healgirl", playerRole: "heal", metric: "dps", encounter: "Ragnaros", score: 5, killedAt: now.Add(-48 * time.Hour)})

	rows, err := f.store.GuildCharacterRoster(ctx, database.GuildCharacterRosterParams{
		TenantID:        uuid.Nil,
		GuildID:         f.guildID,
		SeenWithinDays:  60,
		ParseWindowDays: 60,
		RowLimit:        100,
	})
	require.NoError(t, err)
	require.Len(t, rows, 2, "idle and other-guild members must be filtered out")

	byName := map[string]database.GuildCharacterRosterRow{}
	for _, row := range rows {
		byName[row.Name] = row
	}
	require.InDelta(t, 70, byName["Activeguy"].AvgParse, 0.01)
	require.Equal(t, "dps", byName["Activeguy"].PlayerRole)
	require.InDelta(t, 90, byName["Healgirl"].AvgParse, 0.01)
	require.Equal(t, "heal", byName["Healgirl"].PlayerRole)

	// Members are ordered best parse first.
	require.Equal(t, "Healgirl", rows[0].Name)

	// No last-seen filter returns the idle member too, with no parses -> -1.
	rows, err = f.store.GuildCharacterRoster(ctx, database.GuildCharacterRosterParams{
		TenantID:        uuid.Nil,
		GuildID:         f.guildID,
		SeenWithinDays:  0,
		ParseWindowDays: 60,
		RowLimit:        100,
	})
	require.NoError(t, err)
	require.Len(t, rows, 3)
	byName = map[string]database.GuildCharacterRosterRow{}
	for _, row := range rows {
		byName[row.Name] = row
	}
	require.InDelta(t, -1, byName["Idleguy"].AvgParse, 0.01)
}

func TestGuildTopParses(t *testing.T) {
	t.Parallel()

	f := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	now := time.Now()
	runID := uuid.New()

	otherGuildID := uuid.New()
	f.insertGuild(t, otherGuildID, "Other Guild")
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(1), name: "Aleph", class: "WARRIOR", guildID: f.guildID, level: 60, updatedAt: now})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(2), name: "Beth", class: "WARRIOR", guildID: f.guildID, level: 60, updatedAt: now})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(3), name: "Gimel", class: "PRIEST", guildID: f.guildID, level: 60, updatedAt: now})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(4), name: "Daleth", class: "WARRIOR", guildID: f.guildID, level: 60, updatedAt: now})
	f.insertGamePlayer(t, guildPanelPlayer{guid: testGUID(5), name: "Outsider", class: "WARRIOR", guildID: otherGuildID, level: 60, updatedAt: now})

	// Player A: best 95 on Ragnaros, 90 on Golemagg. Player B: 85.
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 95, killedAt: now.Add(-24 * time.Hour)})
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Golemagg", score: 90, killedAt: now.Add(-24 * time.Hour)})
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(2), playerName: "Beth", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 85, killedAt: now.Add(-24 * time.Hour)})
	// hps rows never appear on a dps board.
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(3), playerName: "Gimel", playerRole: "heal", metric: "hps", encounter: "Ragnaros", score: 99, killedAt: now.Add(-24 * time.Hour)})
	// Too old for a 60 day window.
	f.insertParse(t, guildPanelParse{runID: uuid.New(), playerGUID: testGUID(4), playerName: "Daleth", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 100, killedAt: now.Add(-100 * 24 * time.Hour)})
	// A stale score guild ID must not include a player who now belongs elsewhere.
	f.insertParse(t, guildPanelParse{runID: uuid.New(), playerGUID: testGUID(5), playerName: "Outsider", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 100, killedAt: now.Add(-24 * time.Hour)})
	// Duplicate upload of player A's Ragnaros parse in the same run collapses.
	f.insertParse(t, guildPanelParse{runID: runID, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 95, killedAt: now.Add(-24 * time.Hour)})

	// Simulate scores computed before guild membership was resolved. Current
	// membership, not the denormalized score guild ID, controls this panel.
	_, err := f.pool.Exec(ctx, `UPDATE parse_score_results SET guild_id = NULL WHERE player_guid = ANY($1)`, []string{testGUID(1), testGUID(2)})
	require.NoError(t, err)

	best, err := f.store.GuildTopParses(ctx, database.GuildTopParsesParams{
		TenantID:      uuid.Nil,
		GuildID:       f.guildID,
		Metric:        "dps",
		SinceDays:     60,
		BestPerPlayer: true,
		RowLimit:      10,
	})
	require.NoError(t, err)
	require.Len(t, best, 2)
	require.Equal(t, "Aleph", best[0].PlayerName)
	require.InDelta(t, 95, best[0].PreciseScore, 0.01)
	require.Equal(t, "Beth", best[1].PlayerName)

	all, err := f.store.GuildTopParses(ctx, database.GuildTopParsesParams{
		TenantID:      uuid.Nil,
		GuildID:       f.guildID,
		Metric:        "dps",
		SinceDays:     60,
		BestPerPlayer: false,
		RowLimit:      10,
	})
	require.NoError(t, err)
	require.Len(t, all, 3, "duplicate uploads must collapse to one row")
	require.Equal(t, []float64{95, 90, 85}, []float64{all[0].PreciseScore, all[1].PreciseScore, all[2].PreciseScore})

	// No time filter includes the old triumph.
	allTime, err := f.store.GuildTopParses(ctx, database.GuildTopParsesParams{
		TenantID:      uuid.Nil,
		GuildID:       f.guildID,
		Metric:        "dps",
		SinceDays:     0,
		BestPerPlayer: true,
		RowLimit:      10,
	})
	require.NoError(t, err)
	require.Len(t, allTime, 3)
	require.Equal(t, "Daleth", allTime[0].PlayerName)
}

func TestGuildRunParseAverages(t *testing.T) {
	t.Parallel()

	f := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	now := time.Now()
	run1 := uuid.New()
	run2 := uuid.New()

	otherGuildID := uuid.New()
	f.insertGuild(t, otherGuildID, "Other Guild")
	otherRun := uuid.New()

	// run1, Golemagg killed first: single dps parse.
	f.insertParse(t, guildPanelParse{runID: run1, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Golemagg", score: 70, killedAt: now.Add(-2 * time.Hour)})
	// run1, Ragnaros: dps player at 80, healer's hps at 90 (healer's dps row
	// and the dps player's hps row are both excluded) -> avg 85.
	f.insertParse(t, guildPanelParse{runID: run1, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 80, killedAt: now.Add(-time.Hour)})
	f.insertParse(t, guildPanelParse{runID: run1, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "hps", encounter: "Ragnaros", score: 10, killedAt: now.Add(-time.Hour)})
	f.insertParse(t, guildPanelParse{runID: run1, playerGUID: testGUID(2), playerName: "Beth", playerRole: "heal", metric: "hps", encounter: "Ragnaros", score: 90, killedAt: now.Add(-time.Hour)})
	f.insertParse(t, guildPanelParse{runID: run1, playerGUID: testGUID(2), playerName: "Beth", playerRole: "heal", metric: "dps", encounter: "Ragnaros", score: 2, killedAt: now.Add(-time.Hour)})
	// run2: single dps parse.
	f.insertParse(t, guildPanelParse{runID: run2, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Onyxia", score: 50, killedAt: now})
	// Another guild's run is never aggregated, even when its id is requested.
	f.insertParse(t, guildPanelParse{runID: otherRun, guildID: uuid.NullUUID{UUID: otherGuildID, Valid: true}, playerGUID: testGUID(9), playerName: "Zed", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 100, killedAt: now})

	// A logged Ragnaros kill supplies the fight duration; Golemagg has no
	// encounter row so its duration is 0.
	_, err := f.store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID: uuid.New(), InstanceID: f.instanceID, Name: "Ragnaros",
		KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
		StartTime: database.Timestamptz(now.Add(-time.Hour)), EndTime: database.Timestamptz(now.Add(-time.Hour).Add(5 * time.Minute)),
	})
	require.NoError(t, err)

	rows, err := f.store.GuildRunParseAverages(ctx, database.GuildRunParseAveragesParams{
		TenantID: uuid.Nil,
		GuildID:  f.guildID,
		RunIds:   []uuid.UUID{run1, run2, otherRun},
	})
	require.NoError(t, err)
	require.Len(t, rows, 3)

	type runEncounter struct {
		runID     uuid.UUID
		encounter string
	}
	byEncounter := map[runEncounter]database.GuildRunParseAveragesRow{}
	run1Encounters := []string{}
	for _, row := range rows {
		byEncounter[runEncounter{row.RunID, row.EncounterName}] = row
		if row.RunID == run1 {
			run1Encounters = append(run1Encounters, row.EncounterName)
		}
	}
	// Encounters come back in kill order within a run.
	require.Equal(t, []string{"Golemagg", "Ragnaros"}, run1Encounters)
	require.InDelta(t, 70, byEncounter[runEncounter{run1, "Golemagg"}].AvgParse, 0.01)
	require.EqualValues(t, 1, byEncounter[runEncounter{run1, "Golemagg"}].ParseCount)
	require.InDelta(t, 85, byEncounter[runEncounter{run1, "Ragnaros"}].AvgParse, 0.01)
	require.EqualValues(t, 2, byEncounter[runEncounter{run1, "Ragnaros"}].ParseCount)
	require.InDelta(t, 50, byEncounter[runEncounter{run2, "Onyxia"}].AvgParse, 0.01)

	// Fight duration comes from the logged encounter; unmatched bosses get 0.
	require.EqualValues(t, 5*time.Minute/time.Millisecond, byEncounter[runEncounter{run1, "Ragnaros"}].KillDurationMs)
	require.EqualValues(t, 0, byEncounter[runEncounter{run1, "Golemagg"}].KillDurationMs)
}

func TestGuildEncounterKills(t *testing.T) {
	t.Parallel()

	f := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	night1 := time.Now().Add(-7 * 24 * time.Hour)
	night2 := time.Now().Add(-24 * time.Hour)

	otherGuildID := uuid.New()
	f.insertGuild(t, otherGuildID, "Other Guild")

	insertGuildInstance := func(guildID uuid.UUID, startedAt time.Time) uuid.UUID {
		id := uuid.New()
		_, err := f.store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: f.realmID, LogGroupID: f.logGroupID,
			Name: "Molten Core", HashedSlug: pgtype.Text{String: "gek-" + id.String()[:8], Valid: true},
			GuildID:   uuid.NullUUID{UUID: guildID, Valid: true},
			StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		return id
	}
	insertEncounter := func(instanceID uuid.UUID, name string, killType database.KillType, boss bool, endedAt time.Time) {
		_, err := f.store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: uuid.New(), InstanceID: instanceID, Name: name,
			KillType: killType, Remaining: guid.GUIDs{}, Boss: boss,
			StartTime: database.Timestamptz(endedAt.Add(-5 * time.Minute)), EndTime: database.Timestamptz(endedAt),
		})
		require.NoError(t, err)
	}

	// Night 1: Ragnaros + Golemagg down, a wipe on Lucifron, and trash.
	nightA := insertGuildInstance(f.guildID, night1)
	insertEncounter(nightA, "Ragnaros", database.KillTypeClean, true, night1.Add(30*time.Minute))
	insertEncounter(nightA, "Golemagg", database.KillTypePartial, true, night1.Add(20*time.Minute))
	insertEncounter(nightA, "Lucifron", database.KillTypeWipe, true, night1.Add(10*time.Minute))
	insertEncounter(nightA, "Trashpack", database.KillTypeClean, false, night1.Add(5*time.Minute))
	// A re-upload of night 1 must not double count.
	dupe := insertGuildInstance(f.guildID, night1)
	insertEncounter(dupe, "Ragnaros", database.KillTypeClean, true, night1.Add(30*time.Minute))
	_, err := f.pool.Exec(ctx, "UPDATE log_instances SET duplicate_group_id = $1 WHERE id IN ($1, $2)", nightA, dupe)
	require.NoError(t, err)

	// Night 2: Ragnaros again.
	nightB := insertGuildInstance(f.guildID, night2)
	insertEncounter(nightB, "Ragnaros", database.KillTypeClean, true, night2.Add(30*time.Minute))

	// Another guild's kills never leak in.
	foreign := insertGuildInstance(otherGuildID, night2)
	insertEncounter(foreign, "Onyxia", database.KillTypeClean, true, night2.Add(30*time.Minute))

	rows, err := f.store.GuildEncounterKills(ctx, f.guildID)
	require.NoError(t, err)
	require.Len(t, rows, 2, "only clean/partial boss kills for this guild count")

	byEncounter := map[string]database.GuildEncounterKillsRow{}
	for _, row := range rows {
		byEncounter[row.EncounterName] = row
	}
	require.EqualValues(t, 2, byEncounter["Ragnaros"].Kills)
	require.EqualValues(t, 1, byEncounter["Golemagg"].Kills)
	require.Equal(t, "Molten Core", byEncounter["Ragnaros"].InstanceName)
	require.WithinDuration(t, night2.Add(30*time.Minute), byEncounter["Ragnaros"].LastKilledAt.Time, time.Second)
}

func TestGuildBestRuns(t *testing.T) {
	t.Parallel()

	f := setupGuildPanelsTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	now := time.Now()

	insertClear := func(name string, completedAt time.Time, duration time.Duration, duplicateOf uuid.UUID) uuid.UUID {
		id := uuid.New()
		_, err := f.store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: id, RealmID: f.realmID, LogGroupID: f.logGroupID,
			Name: name, HashedSlug: pgtype.Text{String: "best-" + id.String()[:8], Valid: true},
			GuildID:   uuid.NullUUID{UUID: f.guildID, Valid: true},
			StartTime: database.Timestamptz(completedAt.Add(-duration)), EndTime: database.Timestamptz(completedAt),
			Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		if duplicateOf != uuid.Nil {
			_, err = f.pool.Exec(ctx, "UPDATE log_instances SET duplicate_group_id = $1 WHERE id IN ($1, $2)", duplicateOf, id)
			require.NoError(t, err)
		}
		require.NoError(t, f.store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
			InstanceID: id, InstanceName: name, RealmID: f.realmID,
			GuildID:   uuid.NullUUID{UUID: f.guildID, Valid: true},
			StartTime: database.Timestamptz(completedAt.Add(-duration)), CompletionTime: database.Timestamptz(completedAt),
			DurationMs: int64(duration / time.Millisecond), Proof: []byte(`{"proof":[]}`),
		}))
		return id
	}

	// Molten Core: run A is slower but parses higher; run B is faster.
	runA := insertClear("Molten Core", now.Add(-30*24*time.Hour), 70*time.Minute, uuid.Nil)
	runB := insertClear("Molten Core", now.Add(-20*24*time.Hour), 50*time.Minute, uuid.Nil)
	f.insertParse(t, guildPanelParse{runID: runA, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 95, killedAt: now.Add(-30 * 24 * time.Hour)})
	f.insertParse(t, guildPanelParse{runID: runB, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 60, killedAt: now.Add(-20 * 24 * time.Hour)})
	// A slower re-upload of run B collapses into the same run.
	insertClear("Molten Core", now.Add(-20*24*time.Hour), 55*time.Minute, runB)
	// Onyxia: single clear, no parses.
	insertClear("Onyxia's Lair", now.Add(-10*24*time.Hour), 20*time.Minute, uuid.Nil)
	// An ancient legendary clear outside the 90 day window.
	old := insertClear("Molten Core", now.Add(-150*24*time.Hour), 10*time.Minute, uuid.Nil)
	f.insertParse(t, guildPanelParse{runID: old, playerGUID: testGUID(1), playerName: "Aleph", playerRole: "dps", metric: "dps", encounter: "Ragnaros", score: 100, killedAt: now.Add(-150 * 24 * time.Hour)})

	byInstance := func(rows []database.GuildBestRunsRow) map[string]database.GuildBestRunsRow {
		m := map[string]database.GuildBestRunsRow{}
		for _, row := range rows {
			m[row.InstanceName] = row
		}
		return m
	}

	// Fastest within 90 days: run B wins Molten Core.
	rows, err := f.store.GuildBestRuns(ctx, database.GuildBestRunsParams{
		TenantID: uuid.Nil, GuildID: f.guildID, SinceDays: 90, ByParse: false,
	})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	m := byInstance(rows)
	require.Equal(t, runB, m["Molten Core"].RunID)
	require.EqualValues(t, 50*time.Minute/time.Millisecond, m["Molten Core"].DurationMs)
	require.InDelta(t, -1, m["Onyxia's Lair"].AvgParse, 0.01)

	// Best parse within 90 days: run A wins Molten Core despite being slower.
	rows, err = f.store.GuildBestRuns(ctx, database.GuildBestRunsParams{
		TenantID: uuid.Nil, GuildID: f.guildID, SinceDays: 90, ByParse: true,
	})
	require.NoError(t, err)
	m = byInstance(rows)
	require.Equal(t, runA, m["Molten Core"].RunID)
	require.InDelta(t, 95, m["Molten Core"].AvgParse, 0.01)

	// No window includes the ancient clear.
	rows, err = f.store.GuildBestRuns(ctx, database.GuildBestRunsParams{
		TenantID: uuid.Nil, GuildID: f.guildID, SinceDays: 0, ByParse: false,
	})
	require.NoError(t, err)
	m = byInstance(rows)
	require.Equal(t, old, m["Molten Core"].RunID)
}
