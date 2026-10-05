package gamedataapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSetClassBuffIgnoresUpdatesSelectedDatasets(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Buff Ignore Dataset", Slug: "api-buff-ignore-dataset", WowVersion: "1.12.1",
		BuildVersion: 5875, DefaultFlavor: []string{},
	})
	require.NoError(t, err)

	handler := &Handler{pool: pool}
	req := httptest.NewRequest(http.MethodPut, "/class-buff-ignores", strings.NewReader(`{
			"spell_name":"Power Word: Fortitude",
			"dataset_ids":["`+servicedataset.DefaultDatasetID.String()+`","`+dataset.ID.String()+`","`+dataset.ID.String()+`"],
			"ignored":true
		}`)).WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.SetClassBuffIgnores(recorder, req)
	require.Equal(t, http.StatusNoContent, recorder.Code)

	defaultPolicies, err := store.ListClassBuffPoliciesForDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{{
		NormalizedName: "power word: fortitude", Ignored: true,
	}}, defaultPolicies)
	datasetPolicies, err := store.ListClassBuffPoliciesForDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{{
		NormalizedName: "power word: fortitude", Ignored: true,
	}}, datasetPolicies)

	req = httptest.NewRequest(http.MethodPut, "/class-buff-ignores", strings.NewReader(`{
			"spell_name":"Unending Breath",
			"dataset_ids":["`+dataset.ID.String()+`"],
			"ignored":false
		}`)).WithContext(ctx)
	recorder = httptest.NewRecorder()
	handler.SetClassBuffIgnores(recorder, req)
	require.Equal(t, http.StatusNoContent, recorder.Code)

	datasetPolicies, err = store.ListClassBuffPoliciesForDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{
		{NormalizedName: "power word: fortitude", Ignored: true},
		{NormalizedName: "unending breath", Ignored: false},
	}, datasetPolicies)
}

func TestSetClassBuffIgnoresRejectsUnknownDataset(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	handler := &Handler{pool: pool}
	req := httptest.NewRequest(http.MethodPut, "/class-buff-ignores", strings.NewReader(`{
			"spell_name":"Power Word: Fortitude",
			"dataset_ids":["`+uuid.NewString()+`"],
			"ignored":true
		}`)).WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.SetClassBuffIgnores(recorder, req)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestSetClassBuffIgnoresRequiresRootDomain(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	handler := &Handler{pool: pool}
	tenant := database.Tenant{ID: uuid.New()}
	req := httptest.NewRequest(http.MethodPut, "/class-buff-ignores", strings.NewReader(`{
			"spell_name":"Power Word: Fortitude",
			"dataset_ids":["`+servicedataset.DefaultDatasetID.String()+`"],
			"ignored":true
		}`)).WithContext(servicetenant.WithTenant(ctx, tenant))
	recorder := httptest.NewRecorder()
	handler.SetClassBuffIgnores(recorder, req)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}
