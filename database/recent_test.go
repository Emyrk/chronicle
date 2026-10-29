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

func TestListRecentInstanceGroupsFiltersToRunsWithPositions(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "recent-positions-user"})
	require.NoError(t, err)

	baseTime := time.Date(2026, 9, 1, 18, 0, 0, 0, time.UTC)
	insertInstance := func(name string, uploadedAt time.Time, capabilities []string) uuid.UUID {
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
			Capabilities: capabilities,
		})
		require.NoError(t, err)
		return instanceID
	}

	withPositionsID := insertInstance("Wailing Caverns", baseTime, []string{"unit-resources", "unit-position"})
	_ = insertInstance("Molten Core", baseTime.Add(time.Hour), []string{"interrupt"})

	params := database.ListRecentInstanceGroupsParams{
		StartTime: database.Timestamptz(baseTime.Add(-time.Hour)),
		EndTime:   database.Timestamptz(baseTime.Add(4 * time.Hour)),
	}
	rows, err := store.ListRecentInstanceGroups(ctx, params)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.False(t, rows[0].HasPositions, "newest run first, recorded without positions")
	require.True(t, rows[1].HasPositions)

	params.HasPositions = true
	rows, err = store.ListRecentInstanceGroups(ctx, params)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, withPositionsID, rows[0].ID)
	require.True(t, rows[0].HasPositions)
}

func TestListRecentInstanceGroupsPreferReplayOrdersReplaysThenVideos(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "recent-prefer-user"})
	require.NoError(t, err)

	baseTime := time.Date(2026, 9, 1, 18, 0, 0, 0, time.UTC)
	insertInstance := func(name string, uploadedAt time.Time, capabilities []string, video bool) uuid.UUID {
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
			Capabilities: capabilities,
		})
		require.NoError(t, err)
		if video {
			require.NoError(t, store.InsertStampedYoutubeVideo(ctx, database.InsertStampedYoutubeVideoParams{
				LogInstanceID: uuid.NullUUID{UUID: instanceID, Valid: true},
				InstanceSlug:  pgtype.Text{String: instanceID.String(), Valid: true},
				CreatedAt:     database.Timestamptz(uploadedAt),
				ExportedAt:    database.Timestamptz(uploadedAt),
				VideoUrl:      "https://www.youtube.com/watch?v=" + name,
				Payload:       []database.VideoTimestamp{},
			}))
		}
		return instanceID
	}

	positions := []string{"unit-position"}
	// Inserted oldest to newest; the plain runs are the newest uploads.
	oldReplayID := insertInstance("old-replay", baseTime, positions, false)
	oldVideoID := insertInstance("old-video", baseTime.Add(1*time.Minute), []string{}, true)
	newReplayID := insertInstance("new-replay", baseTime.Add(2*time.Minute), positions, true)
	newVideoID := insertInstance("new-video", baseTime.Add(3*time.Minute), []string{}, true)
	oldOtherID := insertInstance("old-other", baseTime.Add(4*time.Minute), []string{}, false)
	newOtherID := insertInstance("new-other", baseTime.Add(5*time.Minute), []string{}, false)

	params := database.ListRecentInstanceGroupsParams{
		StartTime: database.Timestamptz(baseTime.Add(-time.Hour)),
		EndTime:   database.Timestamptz(baseTime.Add(time.Hour)),
	}
	ids := func(rows []database.ListRecentInstanceGroupsRow) []uuid.UUID {
		out := make([]uuid.UUID, 0, len(rows))
		for _, row := range rows {
			out = append(out, row.ID)
		}
		return out
	}

	rows, err := store.ListRecentInstanceGroups(ctx, params)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{newOtherID, oldOtherID, newVideoID, newReplayID, oldVideoID, oldReplayID}, ids(rows),
		"without prefer_replay the order is newest first")

	params.PreferReplay = true
	want := []uuid.UUID{newReplayID, oldReplayID, newVideoID, oldVideoID, newOtherID, oldOtherID}
	rows, err = store.ListRecentInstanceGroups(ctx, params)
	require.NoError(t, err)
	require.Equal(t, want, ids(rows), "replays, then videos, then the rest, each newest first")

	params.LimitCount = 2
	var paged []uuid.UUID
	for offset := int32(0); offset < int32(len(want)); offset += params.LimitCount {
		params.OffsetCount = offset
		rows, err = store.ListRecentInstanceGroups(ctx, params)
		require.NoError(t, err)
		paged = append(paged, ids(rows)...)
	}
	require.Equal(t, want, paged, "paging walks the same preferred order without gaps or repeats")
}
