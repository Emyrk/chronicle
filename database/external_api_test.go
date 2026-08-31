package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestListExternalAPIRecentInstancesOptionalInstanceNames(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "external-api-" + userID.String()[:8],
	})
	require.NoError(t, err)

	createdAt := time.Now()
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(createdAt), UpdatedAt: database.Timestamptz(createdAt),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	for _, name := range []string{"Molten Core", "Blackwing Lair"} {
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: uuid.New(), RealmID: realmID, LogGroupID: logGroupID,
			Name: name, Capabilities: []string{},
		})
		require.NoError(t, err)
	}

	params := database.ListExternalAPIRecentInstancesParams{ResultLimit: 10}
	rows, err := store.ListExternalAPIRecentInstances(ctx, params)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"Molten Core", "Blackwing Lair"}, recentInstanceNames(rows))

	params.InstanceNames = []string{"Molten Core"}
	rows, err = store.ListExternalAPIRecentInstances(ctx, params)
	require.NoError(t, err)
	require.Equal(t, []string{"Molten Core"}, recentInstanceNames(rows))
}

func recentInstanceNames(rows []database.ListExternalAPIRecentInstancesRow) []string {
	names := make([]string, 0, len(rows))
	for _, row := range rows {
		names = append(names, row.Name)
	}
	return names
}
