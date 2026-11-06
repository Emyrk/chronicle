package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminBackfillTimeParseScoresRejectsInvalidRequest(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/time-scores/backfill", strings.NewReader(`{"batch_size":501}`))
	rec := httptest.NewRecorder()
	(&API{}).AdminBackfillTimeParseScores(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAdminBackfillTimeParseScoresReportsUnavailableQueue(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/parses/time-scores/backfill", strings.NewReader(`{"batch_size":100}`))
	rec := httptest.NewRecorder()
	(&API{}).AdminBackfillTimeParseScores(rec, req)

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

func TestParseAdminTimeParseBackfillRequest(t *testing.T) {
	t.Parallel()

	tenantID := uuid.New()
	args, err := parseAdminTimeParseBackfillRequest(chroniclesdk.AdminBackfillTimeParseScoresRequest{
		TenantID:      tenantID.String(),
		StartedAfter:  "2026-01-01T00:00:00Z",
		StartedBefore: "2026-10-15T00:00:00Z",
		BatchSize:     500,
		Force:         true,
	})
	require.NoError(t, err)
	require.NotNil(t, args.TenantID)
	assert.Equal(t, tenantID, *args.TenantID)
	assert.Equal(t, int32(500), args.BatchSize)
	assert.True(t, args.Force)
}

func TestParseAdminTimeParseBackfillRequestRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		req  chroniclesdk.AdminBackfillTimeParseScoresRequest
	}{
		{name: "tenant", req: chroniclesdk.AdminBackfillTimeParseScoresRequest{TenantID: "nope"}},
		{name: "started after", req: chroniclesdk.AdminBackfillTimeParseScoresRequest{StartedAfter: "2026-01-01"}},
		{name: "started before", req: chroniclesdk.AdminBackfillTimeParseScoresRequest{StartedBefore: "tomorrow"}},
		{name: "date order", req: chroniclesdk.AdminBackfillTimeParseScoresRequest{StartedAfter: "2026-10-15T00:00:00Z", StartedBefore: "2026-01-01T00:00:00Z"}},
		{name: "batch", req: chroniclesdk.AdminBackfillTimeParseScoresRequest{BatchSize: 501}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := parseAdminTimeParseBackfillRequest(test.req)
			require.Error(t, err)
		})
	}
}
