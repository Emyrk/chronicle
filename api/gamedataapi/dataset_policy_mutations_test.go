package gamedataapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func requestWithPolicyPathParams(req *http.Request, datasetID, effectKind, spellID string) *http.Request {
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("datasetID", datasetID)
	if effectKind != "" {
		routeCtx.URLParams.Add("effectKind", effectKind)
	}
	if spellID != "" {
		routeCtx.URLParams.Add("spellID", spellID)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
}

func TestSetCooldownOverridesBumpsDatasetRevisionOnce(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset := revisionTestDataset(t, store, "cooldown-policy-revision")
	_, err := pool.Exec(ctx, `
		INSERT INTO dbc_cooldown_spells (
			dataset_id, spell_id, name, recovery_time_ms, spell_class_set
		) VALUES ($1, 871, 'Shield Wall', 1800000, 4)
	`, dataset.ID)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPut, "/datasets/"+dataset.ID.String()+"/cooldown-overrides", strings.NewReader(`{
		"spell_ids":[871],
		"ignored":true
	}`)).WithContext(ctx)
	req = requestWithPolicyPathParams(req, dataset.ID.String(), "", "")
	recorder := httptest.NewRecorder()
	(&Handler{pool: pool}).SetCooldownOverrides(recorder, req)
	require.Equal(t, http.StatusNoContent, recorder.Code)

	revision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, dataset.Revision+1, revision)
	var overrideCount int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) FROM dataset_cooldown_overrides
		WHERE dataset_id = $1 AND spell_id = 871 AND ignored = TRUE
	`, dataset.ID).Scan(&overrideCount))
	require.Equal(t, 1, overrideCount)
}

func TestConsumablePolicyMutationsBumpRevisionOnlyOnSuccess(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset := revisionTestDataset(t, store, "consumable-policy-revision")
	_, err := pool.Exec(ctx, `
		INSERT INTO dataset_consumable_disambiguations
			(dataset_id, effect_kind, spell_id, item_id, ignored)
		VALUES ($1, 'buff', 200, 1000, FALSE)
	`, dataset.ID)
	require.NoError(t, err)

	handler := &Handler{pool: pool}
	deleteReq := httptest.NewRequest(http.MethodDelete, "/datasets/"+dataset.ID.String()+"/consumable-effects/buff/200", nil).WithContext(ctx)
	deleteReq = requestWithPolicyPathParams(deleteReq, dataset.ID.String(), "buff", "200")
	deleteRecorder := httptest.NewRecorder()
	handler.DeleteConsumableDisambiguation(deleteRecorder, deleteReq)
	require.Equal(t, http.StatusNoContent, deleteRecorder.Code)

	revision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, dataset.Revision+1, revision)
	policies, err := store.ListConsumableEffectPoliciesByDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Empty(t, policies)

	setReq := httptest.NewRequest(http.MethodPut, "/datasets/"+dataset.ID.String()+"/consumable-effects/buff/200", strings.NewReader(`{"item_id":1000}`)).WithContext(ctx)
	setReq = requestWithPolicyPathParams(setReq, dataset.ID.String(), "buff", "200")
	setRecorder := httptest.NewRecorder()
	handler.SetConsumableDisambiguation(setRecorder, setReq)
	require.Equal(t, http.StatusBadRequest, setRecorder.Code)

	unchangedRevision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, revision, unchangedRevision)
}
