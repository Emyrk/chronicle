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

// slowLogCountStore never answers the history lookup before its deadline.
type slowLogCountStore struct{ database.Store }

func (slowLogCountStore) GetCharacterLogCount(ctx context.Context, _ database.GetCharacterLogCountParams) (int32, error) {
	<-ctx.Done()
	return 0, ctx.Err()
}

// failingLogCountStore fails the history lookup.
type failingLogCountStore struct{ database.Store }

func (failingLogCountStore) GetCharacterLogCount(context.Context, database.GetCharacterLogCountParams) (int32, error) {
	return 0, errors.New("boom")
}

// seedCharacterCardStats stores one listed Molten Core log with a boss kill
// for the player and returns the player row.
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
	return store, player
}

func TestFetchCharacterCardStats(t *testing.T) {
	t.Parallel()
	store, player := seedCharacterCardStats(t)
	serviceWith := func(s database.Store) *Service {
		return New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), s)})
	}

	t.Run("counts canonical listed logs", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		stats := serviceWith(store).fetchCharacterCardStats(ctx, player)
		require.NotNil(t, stats.Logs)
		require.Equal(t, 1, *stats.Logs)
	})

	t.Run("lookup times out", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		start := time.Now()
		stats := serviceWith(slowLogCountStore{store}).fetchCharacterCardStats(ctx, player)
		require.Less(t, time.Since(start), characterCardStatTimeout+time.Second)
		require.Nil(t, stats.Logs)
		require.False(t, characterCardParams(player, "Human", "Warrior", nil, stats).Has("logs"))
	})

	t.Run("lookup fails", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		stats := serviceWith(failingLogCountStore{store}).fetchCharacterCardStats(ctx, player)
		require.Nil(t, stats.Logs)
	})
}
