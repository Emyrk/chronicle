package servicetenant

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBulkUpdateTenants(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)

	db, _ := dbtestutil.NewDB(t)
	s := &Service{db: db, cacheSvc: servicecache.New(nil)}
	handler := s.Routes()

	insert := func(name string) database.Tenant {
		tenant, err := db.InsertTenant(AdminBypass(ctx), chroniclesdk.UpsertTenantRequest{
			Name:             name,
			DisabledAds:      []string{"rail"},
			AvailableFormats: []string{},
		}.ToInsertParams())
		require.NoError(t, err)
		return tenant
	}
	a := insert("Alpha")
	b := insert("Beta")

	put := func(req any) *httptest.ResponseRecorder {
		body, err := json.Marshal(req)
		require.NoError(t, err)
		r := httptest.NewRequestWithContext(ctx, http.MethodPut, "/bulk", bytes.NewReader(body))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	// Raw JSON so the explicit empty disabled_ads list survives marshaling,
	// matching what the frontend sends.
	w := put(map[string]any{"tenants": []map[string]any{
		{"id": a.ID, "ads_enabled": true},
		{"id": b.ID, "ads_enabled": true, "disabled_ads": []string{}},
	}})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	gotA, err := db.GetTenantByID(AdminBypass(ctx), a.ID)
	require.NoError(t, err)
	require.True(t, gotA.AdsEnabled)
	require.Equal(t, "Alpha", gotA.Name, "omitted fields are preserved")
	require.Equal(t, []string{"rail"}, gotA.DisabledAds, "omitted fields are preserved")

	gotB, err := db.GetTenantByID(AdminBypass(ctx), b.ID)
	require.NoError(t, err)
	require.True(t, gotB.AdsEnabled)
	require.Empty(t, gotB.DisabledAds, "an explicit empty list clears the value")

	// An unknown tenant rolls back the whole batch.
	disabled := false
	w = put(chroniclesdk.BulkUpdateTenantsRequest{Tenants: []chroniclesdk.UpsertTenantRequest{
		{ID: uuid.NullUUID{UUID: a.ID, Valid: true}, AdsEnabled: &disabled},
		{ID: uuid.NullUUID{UUID: uuid.New(), Valid: true}, AdsEnabled: &disabled},
	}})
	require.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
	gotA, err = db.GetTenantByID(AdminBypass(ctx), a.ID)
	require.NoError(t, err)
	require.True(t, gotA.AdsEnabled)

	// Creates are not allowed through the bulk endpoint.
	w = put(chroniclesdk.BulkUpdateTenantsRequest{Tenants: []chroniclesdk.UpsertTenantRequest{{Name: "Gamma"}}})
	require.Equal(t, http.StatusBadRequest, w.Code, w.Body.String())
}
