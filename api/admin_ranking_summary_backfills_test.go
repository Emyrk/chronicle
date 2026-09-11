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
	"github.com/google/uuid"
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
	assert.Nil(t, created.Preview.EstimatedWALBytes)
	assert.Zero(t, created.BatchesCompleted)
	assert.Zero(t, created.RunsMarkedDirty)

	getRecorder := httptest.NewRecorder()
	api.AdminRankingSummaryBackfills(getRecorder, httptest.NewRequest(http.MethodGet, "/api/v1/admin/parses/ranking-run-summaries/backfills?target_summary_version=2", nil))
	require.Equal(t, http.StatusOK, getRecorder.Code, getRecorder.Body.String())
	var response chroniclesdk.AdminRankingSummaryBackfillsResponse
	require.NoError(t, json.NewDecoder(getRecorder.Body).Decode(&response))
	require.NotNil(t, response.Latest)
	assert.Equal(t, created.ID, response.Latest.ID)
	assert.Nil(t, response.Latest.Preview.EstimatedWALBytes)
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
