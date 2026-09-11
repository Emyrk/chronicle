package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminCreateRankingSummaryBackfill(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	api := &API{Opts: &Options{Pool: pool}}
	requester := uuid.New()
	body := []byte(`{"target_summary_version":2,"batch_size":100,"max_batches":10,"delay_ms":500}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/ranking-run-summaries/backfills", bytes.NewReader(body))
	req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: requester}))
	recorder := httptest.NewRecorder()
	api.AdminCreateRankingSummaryBackfill(recorder, req)
	require.Equal(t, http.StatusCreated, recorder.Code, recorder.Body.String())

	var created chroniclesdk.AdminRankingSummaryBackfill
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&created))
	assert.Equal(t, requester, created.RequestedBy)
	assert.Equal(t, "planned", created.Status)
	assert.Nil(t, created.TenantID)
	require.NotNil(t, created.Preview.EstimatedWALBytes)
	assert.Zero(t, *created.Preview.EstimatedWALBytes)
	assert.Zero(t, created.BatchesCompleted)
	assert.Zero(t, created.RunsMarkedDirty)

	getRecorder := httptest.NewRecorder()
	api.AdminRankingSummaryBackfills(getRecorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/parses/ranking-run-summaries/backfills?target_summary_version=2", nil))
	require.Equal(t, http.StatusOK, getRecorder.Code, getRecorder.Body.String())
	var response chroniclesdk.AdminRankingSummaryBackfillsResponse
	require.NoError(t, json.NewDecoder(getRecorder.Body).Decode(&response))
	require.NotNil(t, response.Latest)
	assert.Equal(t, created.ID, response.Latest.ID)
	require.NotNil(t, response.Latest.Preview.EstimatedWALBytes)
	assert.Zero(t, *response.Latest.Preview.EstimatedWALBytes)
}

func TestAdminRankingSummaryBackfillsReturnsLatestPlanForRequestedScope(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	api := &API{Opts: &Options{Pool: pool}}
	ctx := testutil.Context(t, testutil.WaitShort)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	tenantA, tenantB := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", tenantA, tenantB)
	require.NoError(t, err)
	conn.Release()

	requester := uuid.New()
	create := func(tenantID *uuid.UUID) chroniclesdk.AdminRankingSummaryBackfill {
		request := chroniclesdk.AdminRankingSummaryBackfillRequest{
			TenantID: tenantID, TargetSummaryVersion: 2, BatchSize: 100, MaxBatches: 10, DelayMS: 500,
		}
		body, err := json.Marshal(request)
		require.NoError(t, err)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/ranking-run-summaries/backfills", bytes.NewReader(body))
		req = req.WithContext(chronauth.WithClaims(req.Context(), &claims.Claims{Subject: requester}))
		recorder := httptest.NewRecorder()
		api.AdminCreateRankingSummaryBackfill(recorder, req)
		require.Equal(t, http.StatusCreated, recorder.Code, recorder.Body.String())
		var created chroniclesdk.AdminRankingSummaryBackfill
		require.NoError(t, json.NewDecoder(recorder.Body).Decode(&created))
		return created
	}
	global := create(nil)
	tenantAPlan := create(&tenantA)
	_ = create(&tenantB)

	for _, tt := range []struct {
		path   string
		planID uuid.UUID
	}{
		{"/api/v1/admin/parses/ranking-run-summaries/backfills?target_summary_version=2", global.ID},
		{"/api/v1/admin/parses/ranking-run-summaries/backfills?tenant_id=" + tenantA.String() + "&target_summary_version=2", tenantAPlan.ID},
	} {
		recorder := httptest.NewRecorder()
		api.AdminRankingSummaryBackfills(recorder, httptest.NewRequest(http.MethodGet, tt.path, nil))
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		var response chroniclesdk.AdminRankingSummaryBackfillsResponse
		require.NoError(t, json.NewDecoder(recorder.Body).Decode(&response))
		require.NotNil(t, response.Latest)
		assert.Equal(t, tt.planID, response.Latest.ID)
	}
}

func TestAdminRankingSummaryBackfillsRejectCrossTenantDuplicateGroup(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	api := &API{Opts: &Options{Pool: pool}}
	tenantID := insertAPICrossTenantRankingDuplicateGroup(t, pool)

	for _, path := range []string{
		"/api/v1/admin/parses/ranking-run-summaries/backfills?target_summary_version=2",
		"/api/v1/admin/parses/ranking-run-summaries/backfills?tenant_id=" + tenantID.String() + "&target_summary_version=2",
	} {
		getReq := httptest.NewRequest(http.MethodGet, path, nil)
		getRecorder := httptest.NewRecorder()
		api.AdminRankingSummaryBackfills(getRecorder, getReq)
		require.Equal(t, http.StatusConflict, getRecorder.Code, getRecorder.Body.String())
	}

	body := []byte(`{"tenant_id":"` + tenantID.String() + `","target_summary_version":2,"batch_size":100,"max_batches":10,"delay_ms":500}`)
	postReq := httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/ranking-run-summaries/backfills", bytes.NewReader(body))
	postReq = postReq.WithContext(chronauth.WithClaims(postReq.Context(), &claims.Claims{Subject: uuid.New()}))
	postRecorder := httptest.NewRecorder()
	api.AdminCreateRankingSummaryBackfill(postRecorder, postReq)
	require.Equal(t, http.StatusConflict, postRecorder.Code, postRecorder.Body.String())

	var planCount int
	require.NoError(t, pool.QueryRow(postReq.Context(), "SELECT COUNT(*) FROM ranking_summary_backfills").Scan(&planCount))
	assert.Zero(t, planCount)
}

func insertAPICrossTenantRankingDuplicateGroup(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)

	tenantA, tenantB := uuid.New(), uuid.New()
	serverA, serverB := uuid.New(), uuid.New()
	realmA, realmB := uuid.New(), uuid.New()
	userID, logGroupID := uuid.New(), uuid.New()
	anchor, member := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", tenantA, tenantB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", userID, "api-cross-tenant-"+userID.String(), userID.String()+"@example.com")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_log_groups (id, owner) VALUES ($1, $2)", logGroupID, userID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO parsed_log_group (id) VALUES ($1)", logGroupID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, 'Server A', $2), ($3, 'Server B', $4)", serverA, tenantA, serverB, tenantB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, 'Realm A'), ($3, $4, 'Realm B')", realmA, serverA, realmB, serverB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, duplicate_group_id)
		VALUES ($1, $3, $5, 'Cross Tenant', '{}', NULL), ($2, $4, $5, 'Cross Tenant', '{}', $1)
	`, anchor, member, realmA, realmB, logGroupID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO encounter_dps_rankings
		(instance_id, encounter_name, instance_name, player_guid, player_name, realm_id, realm_name, damage_done, duration_secs, dps, killed_at)
		VALUES ($1, 'Boss', 'Cross Tenant', 'p1', 'P1', $2, 'Realm A', 100, 10, 10, now())
	`, anchor, realmA)
	require.NoError(t, err)
	return tenantA
}

func TestAdminCreateRankingSummaryBackfillValidation(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	api := &API{Opts: &Options{Pool: pool}}
	tests := []struct {
		name string
		body string
	}{
		{"batch too small", `{"target_summary_version":2,"batch_size":0,"max_batches":1,"delay_ms":100}`},
		{"batch too large", `{"target_summary_version":2,"batch_size":501,"max_batches":1,"delay_ms":100}`},
		{"max batches too small", `{"target_summary_version":2,"batch_size":1,"max_batches":0,"delay_ms":100}`},
		{"max batches too large", `{"target_summary_version":2,"batch_size":1,"max_batches":101,"delay_ms":100}`},
		{"delay too small", `{"target_summary_version":2,"batch_size":1,"max_batches":1,"delay_ms":99}`},
		{"delay too large", `{"target_summary_version":2,"batch_size":1,"max_batches":1,"delay_ms":60001}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/ranking-run-summaries/backfills", bytes.NewBufferString(tt.body))
			recorder := httptest.NewRecorder()
			api.AdminCreateRankingSummaryBackfill(recorder, req)
			assert.Equal(t, http.StatusBadRequest, recorder.Code)
		})
	}
}

func TestAdminRankingSummaryBackfillsRejectsInvalidQuery(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	api := &API{Opts: &Options{Pool: pool}}
	for _, path := range []string{
		"/api/v1/admin/parses/ranking-run-summaries/backfills?tenant_id=nope",
		"/api/v1/admin/parses/ranking-run-summaries/backfills?target_summary_version=0",
	} {
		recorder := httptest.NewRecorder()
		api.AdminRankingSummaryBackfills(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	}
}
