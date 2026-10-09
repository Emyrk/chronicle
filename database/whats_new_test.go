package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicewhatsnew"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInitializeUserWhatsNewState(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "whats-new-" + userID.String()[:8],
	})
	require.NoError(t, err)

	currentID := servicewhatsnew.CurrentID()
	_, err = store.InitializeUserWhatsNewState(ctx, database.InitializeUserWhatsNewStateParams{
		UserID: userID, SeenID: currentID,
	})
	require.NoError(t, err)

	state, err := store.GetUserWhatsNewState(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, currentID, state.SeenID)
}
