package database_test

import (
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestUserCustomPanelSettingsRevision(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "panels-" + userID.String()[:8]})
	require.NoError(t, err)

	created, err := store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: true, Installations: []byte(`[]`), ExpectedRevision: 0,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), created.Revision)
	require.True(t, created.Enabled)

	_, err = store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: false, Installations: []byte(`[]`), ExpectedRevision: 0,
	})
	require.True(t, errors.Is(err, pgx.ErrNoRows))

	updated, err := store.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID: userID, Enabled: false, Installations: []byte(`[]`), ExpectedRevision: 1,
	})
	require.NoError(t, err)
	require.Equal(t, int64(2), updated.Revision)
	require.False(t, updated.Enabled)
}
