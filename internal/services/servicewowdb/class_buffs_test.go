package servicewowdb

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestApplyClassBuffPolicies(t *testing.T) {
	t.Parallel()
	byClass := map[string][]classBuffSpell{
		"Priest": {
			{ID: 1243, Name: "Power Word: Fortitude"},
			{ID: 1244, Name: " power word: fortitude "},
			{ID: 21562, Name: "Prayer of Fortitude"},
		},
		"Generic": {
			{ID: 5697, Name: "Unending Breath"},
			{ID: 11743, Name: "Detect Greater Invisibility"},
		},
	}

	applyClassBuffPolicies(byClass, map[string]bool{
		"power word: fortitude": true,
		"unending breath":       false,
	})

	require.True(t, byClass["Priest"][0].Ignored)
	require.True(t, byClass["Priest"][1].Ignored)
	require.False(t, byClass["Priest"][2].Ignored)
	require.False(t, byClass["Generic"][0].Ignored)
	require.True(t, byClass["Generic"][1].Ignored)
}

func TestHandleGetClassBuffsAppliesGenericOptIn(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Generic Buffs", Slug: "generic-buffs", WowVersion: "1.12.1",
		BuildVersion: 5875, DefaultFlavor: []string{},
	})
	require.NoError(t, err)

	raw, err := json.Marshal(map[string][]classBuffSpell{
		"Generic": {
			{ID: 5697, Name: "Unending Breath"},
			{ID: 11743, Name: "Detect Greater Invisibility"},
		},
	})
	require.NoError(t, err)
	require.NoError(t, store.UpsertDatasetClassBuffs(ctx, database.UpsertDatasetClassBuffsParams{
		DatasetID: dataset.ID,
		Data:      raw,
	}))
	require.NoError(t, store.UpsertClassBuffIgnore(ctx, database.UpsertClassBuffIgnoreParams{
		DatasetID: dataset.ID,
		SpellName: "Unending Breath",
		Ignored:   false,
	}))

	service := &Service{store: store}
	req := httptest.NewRequest(http.MethodGet, "/class-buffs?dataset_id="+dataset.ID.String(), nil).WithContext(ctx)
	recorder := httptest.NewRecorder()
	service.handleGetClassBuffs(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code)

	var response map[string][]classBuffSpell
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.False(t, response["Generic"][0].Ignored)
	require.True(t, response["Generic"][1].Ignored)
}
