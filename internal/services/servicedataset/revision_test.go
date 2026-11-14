package servicedataset

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestUpsertDatasetUpdateBumpsRevision(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Dataset Revision",
		Slug:          "dataset-revision",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	service := &Service{db: store}
	request := httptest.NewRequest(http.MethodPut, "/"+dataset.ID.String(), bytes.NewBufferString(`{"description":"updated"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	service.Routes().ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	updated, err := store.GetDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, "updated", updated.Description)
	require.Greater(t, updated.Revision, dataset.Revision)
}
