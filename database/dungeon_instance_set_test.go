package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestListDungeonInstanceSet(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "dungeon-set-user-" + userID.String()[:8],
	})
	require.NoError(t, err)

	insertLogGroup := func() uuid.UUID {
		t.Helper()
		now := time.Now()
		logGroupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:        logGroupID,
			Owner:     userID,
			LogType:   database.LogTypeV1,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
		return logGroupID
	}

	base := time.Date(2026, time.November, 15, 23, 0, 0, 0, time.UTC)
	insertInstance := func(logGroupID uuid.UUID, name string, category pgtype.Text, startOffset time.Duration) uuid.UUID {
		t.Helper()
		instanceID := uuid.New()
		_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
			ID:           instanceID,
			RealmID:      realmID,
			LogGroupID:   logGroupID,
			Name:         name,
			HashedSlug:   pgtype.Text{String: instanceID.String(), Valid: true},
			StartTime:    database.Timestamptz(base.Add(startOffset)),
			EndTime:      database.Timestamptz(base.Add(startOffset + 30*time.Minute)),
			Capabilities: []string{},
			Category:     category,
		})
		require.NoError(t, err)
		return instanceID
	}
	insertEncounter := func(instanceID uuid.UUID, name string, boss bool, killType database.KillType) {
		t.Helper()
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID:         uuid.New(),
			InstanceID: instanceID,
			Name:       name,
			KillType:   killType,
			Boss:       boss,
			Remaining:  guid.GUIDs{},
			StartTime:  database.Timestamptz(base),
			EndTime:    database.Timestamptz(base.Add(time.Minute)),
		})
		require.NoError(t, err)
	}

	dungeon := pgtype.Text{String: "dungeon", Valid: true}
	raid := pgtype.Text{String: "raid", Valid: true}
	logGroupID := insertLogGroup()

	// Inserted out of order; the set is returned in log order.
	third := insertInstance(logGroupID, "City of Dalaran", dungeon, 2*time.Hour)
	first := insertInstance(logGroupID, "City of Dalaran", dungeon, 0)
	second := insertInstance(logGroupID, "City of Dalaran", dungeon, time.Hour)
	insertEncounter(first, "Atrexis the Grave Knight", true, database.KillTypeClean)
	insertEncounter(first, "Lyn the Ignored", true, database.KillTypePartial)
	insertEncounter(second, "Atrexis the Grave Knight", true, database.KillTypeWipe)
	insertEncounter(second, "Atrexis the Grave Knight", true, database.KillTypeClean)
	insertEncounter(second, "Fallen Mage", false, database.KillTypeWipe)
	insertEncounter(second, "Kirin Tor Necromancer", false, database.KillTypeReset)

	// Raids and uncategorized instances never form a set.
	insertInstance(logGroupID, "Naxxramas", raid, 0)
	insertInstance(logGroupID, "Naxxramas", raid, time.Hour)
	insertInstance(logGroupID, "Unknown Dungeon", pgtype.Text{}, 0)
	insertInstance(logGroupID, "Unknown Dungeon", pgtype.Text{}, time.Hour)

	// The same dungeon in another log belongs to that log's set.
	insertInstance(insertLogGroup(), "City of Dalaran", dungeon, 0)

	rows, err := store.ListDungeonInstanceSet(ctx, database.ListDungeonInstanceSetParams{
		LogGroupID: logGroupID,
		Name:       "City of Dalaran",
	})
	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, []uuid.UUID{first, second, third}, []uuid.UUID{rows[0].ID, rows[1].ID, rows[2].ID})
	require.EqualValues(t, 2, rows[0].BossKills)
	require.EqualValues(t, 0, rows[0].Wipes)
	require.EqualValues(t, 1, rows[1].BossKills, "a boss killed after a wipe counts once")
	require.EqualValues(t, 2, rows[1].Wipes, "boss and trash wipes count; resets do not")
	require.EqualValues(t, 0, rows[2].BossKills)

	for _, name := range []string{"Naxxramas", "Unknown Dungeon"} {
		rows, err := store.ListDungeonInstanceSet(ctx, database.ListDungeonInstanceSetParams{
			LogGroupID: logGroupID,
			Name:       name,
		})
		require.NoError(t, err)
		require.Empty(t, rows, name)
	}
}
