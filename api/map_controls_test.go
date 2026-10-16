package api

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidateMapControls(t *testing.T) {
	t.Parallel()
	require.NoError(t, validateMapControls(chroniclesdk.MapControls{Bindings: map[string]string{"move_forward": "KeyW", "rotate_left": "ArrowLeft"}}))
	require.Error(t, validateMapControls(chroniclesdk.MapControls{Bindings: map[string]string{"Move Forward": "KeyW"}}))
	require.Error(t, validateMapControls(chroniclesdk.MapControls{Bindings: map[string]string{"move_forward": "<script>"}}))
	tooMany := map[string]string{}
	for i := 0; i <= maxMapControlBindings; i++ {
		tooMany[string(rune('a'+i%26))+string(rune('a'+i/26))] = "KeyW"
	}
	require.Error(t, validateMapControls(chroniclesdk.MapControls{Bindings: tooMany}))
}

func TestUserMapControlsRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "map-" + userID.String()[:8]})
	require.NoError(t, err)

	row, err := store.UpsertUserMapControls(ctx, database.UpsertUserMapControlsParams{UserID: userID, Controls: []byte(`{"bindings":{"move_forward":"KeyZ"}}`)})
	require.NoError(t, err)
	controls, err := mapControlsFromRow(row)
	require.NoError(t, err)
	require.Equal(t, map[string]string{"move_forward": "KeyZ"}, controls.Bindings)

	row, err = store.UpsertUserMapControls(ctx, database.UpsertUserMapControlsParams{UserID: userID, Controls: []byte(`{"bindings":{}}`)})
	require.NoError(t, err)
	controls, err = mapControlsFromRow(row)
	require.NoError(t, err)
	require.Empty(t, controls.Bindings)

	require.NoError(t, store.DeleteUserMapControls(ctx, userID))
	_, err = store.GetUserMapControls(ctx, userID)
	require.Error(t, err)
}
