package database_test

import (
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
// a realm, a guild, and a log instance.
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
