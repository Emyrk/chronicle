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

func TestListRecentInstanceGroupsPagesRunsAndRanksRepresentative(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "recent-user",
	})
	require.NoError(t, err)

	insertInstance := func(name string, uploadedAt time.Time, bossEncounters, trashEncounters int) uuid.UUID {
		t.Helper()

		logGroupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:        logGroupID,
			Owner:     userID,
			LogType:   database.LogTypeV1,
			CreatedAt: database.Timestamptz(uploadedAt),
			UpdatedAt: database.Timestamptz(uploadedAt),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

		instanceID := uuid.New()
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID:           instanceID,
			RealmID:      realmID,
			LogGroupID:   logGroupID,
			Name:         name,
			HashedSlug:   pgtype.Text{String: instanceID.String(), Valid: true},
			Capabilities: []string{},
		})
		require.NoError(t, err)

		encounterIndex := 0
		insertEncounter := func(boss bool) {
			t.Helper()
			startTime := uploadedAt.Add(time.Duration(encounterIndex) * time.Minute)
			encounterIndex++
			_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
				ID:         uuid.New(),
				InstanceID: instanceID,
				Name:       "Encounter",
				KillType:   database.KillTypeClean,
				Remaining:  guid.GUIDs{},
				Boss:       boss,
				StartTime:  database.Timestamptz(startTime),
				EndTime:    database.Timestamptz(startTime.Add(30 * time.Second)),
			})
			require.NoError(t, err)
		}
		for range bossEncounters {
			insertEncounter(true)
		}
		for range trashEncounters {
			insertEncounter(false)
		}

		return instanceID
	}

	baseTime := time.Date(2026, 9, 1, 18, 0, 0, 0, time.UTC)

	groupAnchorID := insertInstance("Molten Core", baseTime.Add(2*time.Hour), 1, 5)
	mostBossesID := insertInstance("Molten Core", baseTime.Add(2*time.Hour), 2, 0)
	representativeID := insertInstance("Molten Core", baseTime.Add(2*time.Hour), 2, 1)
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: groupAnchorID, Valid: true},
		Ids:              []uuid.UUID{groupAnchorID, mostBossesID, representativeID},
	}))

	secondRunID := insertInstance("Blackwing Lair", baseTime.Add(time.Hour), 1, 0)
	_ = insertInstance("Zul'Gurub", baseTime, 1, 0)

	params := database.ListRecentInstanceGroupsParams{
		StartTime:  database.Timestamptz(baseTime.Add(-time.Hour)),
		EndTime:    database.Timestamptz(baseTime.Add(4 * time.Hour)),
		LimitCount: 1,
	}

	rows, err := store.ListRecentInstanceGroups(ctx, params)
	require.NoError(t, err)
	require.Len(t, rows, 3, "the run limit should still return every duplicate upload")
	require.Equal(t, representativeID, rows[0].ID, "most bosses, then most encounters, selects the representative")
	require.ElementsMatch(t, []uuid.UUID{groupAnchorID, mostBossesID, representativeID}, []uuid.UUID{
		rows[0].ID,
		rows[1].ID,
		rows[2].ID,
	})

	params.OffsetCount = 1
	rows, err = store.ListRecentInstanceGroups(ctx, params)
	require.NoError(t, err)
	require.Len(t, rows, 1, "offset should skip one logical run, not one upload")
	require.Equal(t, secondRunID, rows[0].ID)
}
