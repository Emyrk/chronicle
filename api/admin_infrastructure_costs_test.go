package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/infrastructurecosts"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAdminInfrastructureCostsRequiresGlobalAdmin(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	userID := uuid.New()
	handlerAPI := &API{Opts: &Options{}, Zed: zed}
	router := chi.NewRouter()
	router.With(httpmw.Can(zed, policy.New().GlobalChronicle().CanAdmin_users_User)).Get("/infrastructure-costs", handlerAPI.AdminListInfrastructureCosts)
	req := httptest.NewRequest(http.MethodGet, "/infrastructure-costs", nil)
	req = req.WithContext(authz.AsUser(req.Context(), userID))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestAdminGenerateInfrastructureCostUnavailable(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/infrastructure-costs/generate", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	(&API{Opts: &Options{}}).AdminGenerateInfrastructureCost(rec, req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.JSONEq(t, `{"message":"Infrastructure cost reports are unavailable."}`, rec.Body.String())
}
func TestAdminGenerateInfrastructureCostRejectsHalfPeriod(t *testing.T) {
	t.Parallel()
	svc := &infrastructurecosts.Service{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/infrastructure-costs/generate", strings.NewReader(`{"periodStart":"2026-10-01T00:00:00Z"}`))
	rec := httptest.NewRecorder()
	(&API{Opts: &Options{InfrastructureCosts: svc}, Queues: &riverqueue.Queues{}}).AdminGenerateInfrastructureCost(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
