package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAdminResyncBillingReportsUnavailableQueue(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/billing/resync", nil)
	rec := httptest.NewRecorder()
	(&API{}).AdminResyncBilling(rec, req)

	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.JSONEq(t, `{"message":"Billing reconciliation queue is unavailable."}`, rec.Body.String())
}
