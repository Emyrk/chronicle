package api

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

// Rating configuration is migration-owned; none of its former admin routes
// should match, even though the legacy handlers remain available to Go callers.
func TestAdminRatingConfigurationRoutesRemoved(t *testing.T) {
	t.Parallel()
	routes := chi.NewRouter()
	routes.Route("/api/v1/admin/ratings", (&API{}).adminRatingRoutes)
	groupID := uuid.New().String()
	realmID := uuid.New().String()
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/groups"},
		{http.MethodPost, "/groups"},
		{http.MethodPut, "/groups/" + groupID},
		{http.MethodDelete, "/groups/" + groupID},
		{http.MethodPut, "/groups/" + groupID + "/realms/" + realmID},
		{http.MethodDelete, "/realms/" + realmID + "/group"},
		{http.MethodGet, "/policies"},
		{http.MethodPut, "/groups/" + groupID + "/policy"},
		{http.MethodGet, "/groups/" + groupID + "/raids"},
		{http.MethodPut, "/groups/" + groupID + "/raids"},
		{http.MethodDelete, "/groups/" + groupID + "/raids"},
		{http.MethodGet, "/groups/" + groupID + "/bosses"},
		{http.MethodPut, "/groups/" + groupID + "/bosses"},
		{http.MethodDelete, "/groups/" + groupID + "/bosses"},
	} {
		path := "/api/v1/admin/ratings" + tc.path
		t.Run(tc.method+" "+path, func(t *testing.T) {
			t.Parallel()
			require.False(t, routes.Match(chi.NewRouteContext(), tc.method, path))
		})
	}
	for _, path := range []string{"/api/v1/admin/ratings/rebuild", "/api/v1/admin/ratings/renown/repair"} {
		require.True(t, routes.Match(chi.NewRouteContext(), http.MethodPost, path), path)
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
		require.Equal(t, http.StatusForbidden, rec.Code, "anonymous maintenance request: %s", path)
	}
}

// The endpoint uses River's unique insertion contract rather than creating
// duplicate maintenance jobs. A tenant rebuild never targets another tenant.
func TestAdminRatingMaintenanceJobs(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	require.NoError(t, err)
	api := &API{Queues: &riverqueue.Queues{Client: client}}

	call := func(handler http.HandlerFunc, tenant uuid.UUID) chroniclesdk.AdminRatingJobResponse {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		if tenant != uuid.Nil {
			req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenant))
		}
		rec := httptest.NewRecorder()
		handler(rec, req)
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
		var response chroniclesdk.AdminRatingJobResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		require.Positive(t, response.JobID)
		require.Equal(t, "available", response.JobState)
		return response
	}

	repair := call(api.AdminDispatchRenownRepair, uuid.Nil)
	repairDuplicate := call(api.AdminDispatchRenownRepair, uuid.Nil)
	require.True(t, repairDuplicate.UniqueSkippedAsDuplicate)
	require.Equal(t, repair.JobID, repairDuplicate.JobID)

	tenant := uuid.New()
	rebuild := call(api.AdminRebuildRatings, tenant)
	rebuildDuplicate := call(api.AdminRebuildRatings, tenant)
	require.True(t, rebuildDuplicate.UniqueSkippedAsDuplicate)
	require.Equal(t, rebuild.JobID, rebuildDuplicate.JobID)
	other := call(api.AdminRebuildRatings, uuid.New())
	require.NotEqual(t, rebuild.JobID, other.JobID)

	root := call(api.AdminRebuildRatings, uuid.Nil)
	require.NotEqual(t, rebuild.JobID, root.JobID)

	job, err := client.JobGet(t.Context(), rebuild.JobID)
	require.NoError(t, err)
	var args servicerankings.ArgsRebuildTenantRatings
	require.NoError(t, json.Unmarshal(job.EncodedArgs, &args))
	require.Equal(t, tenant, args.TenantID)
}

func TestAdminRatingMaintenanceQueueUnavailable(t *testing.T) {
	t.Parallel()
	for _, api := range []*API{{}, {Queues: &riverqueue.Queues{}}} {
		for _, handler := range []http.HandlerFunc{api.AdminDispatchRenownRepair, api.AdminRebuildRatings} {
			rec := httptest.NewRecorder()
			handler(rec, httptest.NewRequest(http.MethodPost, "/", nil))
			require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		}
	}
}

func TestAdminRatingPolicyValidation(t *testing.T) {
	t.Parallel()
	valid := chroniclesdk.AdminPutRatingGroupPolicyRequest{Version: 1, PeriodDays: 30, HalfLifeDays: 7, BestWeight: 0.5, FormWeight: 0.3, FloorWeight: 0.2, RankOneWeight: 0.5, FullRankKills: 10}
	require.True(t, validRatingPolicy(valid))
	cases := map[string]func(*chroniclesdk.AdminPutRatingGroupPolicyRequest){
		"missing version":       func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.Version = 0 },
		"negative duration":     func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.HalfLifeDays = -1 },
		"nonfinite duration":    func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.HalfLifeDays = math.Inf(1) },
		"negative weight":       func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.BestWeight = -1 },
		"incorrect sum":         func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.BestWeight = 0.6 },
		"nonfinite weight":      func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.FormWeight = math.NaN() },
		"zero kills":            func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.FullRankKills = 0 },
		"rank one out of range": func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.RankOneWeight = 2 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) { t.Parallel(); p := valid; mutate(&p); require.False(t, validRatingPolicy(p)) })
	}
}

func TestAdminRatingRaidPolicyValidation(t *testing.T) {
	t.Parallel()
	valid := chroniclesdk.AdminPutRatingRaidPolicyRequest{ExpectedVersion: 1, InstanceName: "Molten Core", PeakWeight: 1, MasteryWeight: 2}
	require.True(t, validRatingRaidPolicy(valid))
	cases := map[string]func(*chroniclesdk.AdminPutRatingRaidPolicyRequest){
		"missing version":         func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.ExpectedVersion = 0 },
		"blank instance":          func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.InstanceName = " " },
		"zero peak weight":        func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.PeakWeight = 0 },
		"negative mastery weight": func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.MasteryWeight = -1 },
		"infinite peak weight":    func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.PeakWeight = math.Inf(1) },
		"nan mastery weight":      func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.MasteryWeight = math.NaN() },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p := valid
			mutate(&p)
			require.False(t, validRatingRaidPolicy(p))
		})
	}
}

func TestAdminRatingRequestLimit(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodPut, "/", bytes.NewReader([]byte(`{"name":"`+strings.Repeat("x", ratingAdminBodyLimit)+`"}`)))
	rec := httptest.NewRecorder()
	var name chroniclesdk.AdminRenameRatingGroupRequest
	require.False(t, ratingAdminRead(rec, req, &name))
	require.NotEqual(t, http.StatusOK, rec.Code)
}

func TestAdminRatingGroupName(t *testing.T) {
	t.Parallel()
	require.True(t, ratingAdminName("Raid A"))
	for _, s := range []string{"", "  ", " leading", "trailing ", strings.Repeat("a", 201)} {
		require.False(t, ratingAdminName(s))
	}
}
