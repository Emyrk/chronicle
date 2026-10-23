package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestTechnicalHintActivityUsesPublic24HourRuns(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	endTime := time.Now().UTC().Add(time.Minute)
	startTime := endTime.Add(-24 * time.Hour)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "technical-hints-user"})
	require.NoError(t, err)

	insertInstance := func(name string, activityTime time.Time, unlisted bool) uuid.UUID {
		t.Helper()
		logGroupID := uuid.New()
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID:        logGroupID,
			Owner:     userID,
			LogType:   database.LogTypeV1,
			Unlisted:  unlisted,
			CreatedAt: database.Timestamptz(activityTime),
			UpdatedAt: database.Timestamptz(activityTime),
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
			StartTime:    database.Timestamptz(activityTime),
			EndTime:      database.Timestamptz(activityTime.Add(time.Hour)),
			Capabilities: []string{},
		})
		require.NoError(t, err)
		return instanceID
	}

	anchorID := insertInstance("Molten Core", endTime.Add(-time.Hour), false)
	duplicateID := insertInstance("Molten Core", endTime.Add(-2*time.Hour), false)
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true},
		Ids:              []uuid.UUID{anchorID, duplicateID},
	}))
	_ = insertInstance("Blackwing Lair", endTime.Add(-3*time.Hour), false)
	_ = insertInstance("Onyxia's Lair", startTime.Add(-time.Second), false)
	_ = insertInstance("Zul'Gurub", endTime.Add(-4*time.Hour), true)

	window := database.TechnicalHintActivityTotalsParams{
		StartTime: database.Timestamptz(startTime),
		EndTime:   database.Timestamptz(endTime),
	}
	totals, err := store.TechnicalHintActivityTotals(ctx, window)
	require.NoError(t, err)
	require.EqualValues(t, 4, totals.LogsProcessed, "all public logs finalized in the window count, even when the recorded run is older")
	require.EqualValues(t, 2, totals.InstanceRuns)

	active, err := store.TechnicalHintMostActiveInstances(ctx, database.TechnicalHintMostActiveInstancesParams{
		StartTime:  window.StartTime,
		EndTime:    window.EndTime,
		LimitCount: 3,
	})
	require.NoError(t, err)
	require.Equal(t, []database.TechnicalHintMostActiveInstancesRow{
		{InstanceName: "Blackwing Lair", RunCount: 1},
		{InstanceName: "Molten Core", RunCount: 1},
	}, active)
}
