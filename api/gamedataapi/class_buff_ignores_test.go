package gamedataapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSetClassBuffIgnoresUpdatesSelectedScopes(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Buff Ignore Tenant", AvailableFormats: []string{},
	})
	require.NoError(t, err)

	handler := &Handler{pool: pool}
	req := httptest.NewRequest(http.MethodPut, "/class-buff-ignores", strings.NewReader(`{
		"spell_name":"Power Word: Fortitude",
		"tenant_ids":["`+tenant.ID.String()+`"],
		"include_root":true,
		"ignored":true
	}`)).WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.SetClassBuffIgnores(recorder, req)
	require.Equal(t, http.StatusNoContent, recorder.Code)

	rootNames, err := store.ListClassBuffIgnoresForScope(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, rootNames)
	tenantNames, err := store.ListClassBuffIgnoresForScope(ctx, tenant.ID)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, tenantNames)
}

func TestSetClassBuffIgnoresRequiresRootDomain(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	handler := &Handler{pool: pool}
	tenant := database.Tenant{ID: uuid.New()}
	req := httptest.NewRequest(http.MethodPut, "/class-buff-ignores", strings.NewReader(`{
		"spell_name":"Power Word: Fortitude",
		"include_root":true,
		"ignored":true
	}`)).WithContext(servicetenant.WithTenant(ctx, tenant))
	recorder := httptest.NewRecorder()
	handler.SetClassBuffIgnores(recorder, req)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}
