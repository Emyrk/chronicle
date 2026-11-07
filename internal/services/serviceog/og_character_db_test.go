package serviceog

import (
	"context"
	"errors"
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

// slowEncounterStore never answers the kill lookup before its deadline.
type slowEncounterStore struct{ database.Store }

func (slowEncounterStore) GetCharacterEncounterStats(ctx context.Context, _ database.GetCharacterEncounterStatsParams) ([]database.GetCharacterEncounterStatsRow, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

// failingParseStore fails the parse lookup.
type failingParseStore struct{ database.Store }

func (failingParseStore) GetCharacterParseHistory(context.Context, database.GetCharacterParseHistoryParams) ([]database.GetCharacterParseHistoryRow, error) {
	return nil, errors.New("boom")
}

// seedCharacterCardStats stores one Molten Core kill and its parse for the
// player, like the parses handler fixture, and returns the player row.
func seedCharacterCardStats(t *testing.T) (database.Store, database.GetGamePlayerByGUIDRow) {
	t.Helper()
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID, realmID := uuid.New(), uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "test-realm")
	require.NoError(t, err)
	conn.Release()

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "test-user"})
	require.NoError(t, err)
	now := time.Now()
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", Capabilities: []string{}, StartTime: database.Timestamptz(now.Add(-time.Hour)),
	})
	require.NoError(t, err)

	player := database.GetGamePlayerByGUIDRow{ID: guid.GUID(0x1234), RealmID: realmID, Name: "Moonbrew", Class: database.WowPlayableClassWARRIOR}
	encounterID := uuid.New()
	_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID: encounterID, InstanceID: instanceID, Name: "Ragnaros", KillType: database.KillTypeClean,
		Remaining: guid.GUIDs{}, Boss: true,
		StartTime: database.Timestamptz(now.Add(-time.Minute)), EndTime: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: instanceID,
		EncounterName: "Ragnaros", InstanceName: "Molten Core",
		PlayerGuid: player.ID.String(), PlayerName: player.Name, PlayerClass: "WARRIOR", PlayerSpec: "Arms",
		DifficultyName: "Normal", MaxPlayers: 40, RealmID: realmID, RealmName: "test-realm",
		DamageDone: 60_000, DurationSecs: 60, Dps: 1000, KilledAt: database.Timestamptz(now), LogHashedSlug: "slug",
	}))
	require.NoError(t, store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID: uuid.Nil, InstanceID: instanceID, RunID: instanceID,
		EncounterName: "Ragnaros", PlayerGuid: player.ID.String(), PlayerName: player.Name,
		PlayerClass: "WARRIOR", PlayerSpec: "Arms", PlayerRole: "dps",
		Metric: "dps", MetricValue: 1000, PreciseScore: 94.6, DisplayScore: 95, Rank: 1, SampleSize: 10, Status: "ok",
		InstanceName: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40, KilledAt: database.Timestamptz(now),
	}))
	return store, player
}

func TestFetchCharacterCardStats(t *testing.T) {
	t.Parallel()
	store, player := seedCharacterCardStats(t)
	apiWith := func(s database.Store) *Service {
		return New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s)})
	}

	t.Run("both lookups", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		stats := apiWith(store).fetchCharacterCardStats(ctx, player)
		require.Len(t, stats.Parses, 1)
		require.InDelta(t, 94.6, stats.Parses[0].PreciseScore, 0.001)
		require.Len(t, stats.Encounters, 1)
		require.EqualValues(t, 1, stats.Encounters[0].Kills)
	})

	t.Run("kill lookup times out", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		start := time.Now()
		stats := apiWith(slowEncounterStore{store}).fetchCharacterCardStats(ctx, player)
		require.Less(t, time.Since(start), characterCardStatTimeout+time.Second)
		require.Len(t, stats.Parses, 1)
		require.Nil(t, stats.Encounters)
		// The card keeps the parse and drops only the kill count.
		params := characterCardParams(player, "Human", "Warrior", stats)
		require.Equal(t, "94.6", params.Get("parse"))
		require.False(t, params.Has("kills"))
	})

	t.Run("parse lookup fails", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		stats := apiWith(failingParseStore{store}).fetchCharacterCardStats(ctx, player)
		require.Nil(t, stats.Parses)
		require.Len(t, stats.Encounters, 1)
	})
}
