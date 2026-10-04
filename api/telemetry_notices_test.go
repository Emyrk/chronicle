package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestTelemetryNoticeToSDK(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.October, 4, 12, 0, 0, 0, time.UTC)
	startsAt := updatedAt.Add(-time.Hour)
	row := database.TelemetryNotice{
		ID:          "maintenance",
		Audience:    telemetryNoticeAudiencePublic,
		Category:    "maintenance",
		Severity:    "warning",
		Title:       "Scheduled maintenance",
		Message:     "Uploads may be briefly unavailable.",
		ActionLabel: pgtype.Text{String: "Status", Valid: true},
		ActionUrl:   pgtype.Text{String: "https://chronicleclassic.com", Valid: true},
		StartsAt:    pgtype.Timestamptz{Time: startsAt, Valid: true},
		UpdatedAt:   pgtype.Timestamptz{Time: updatedAt, Valid: true},
	}

	require.Equal(t, chroniclesdk.TelemetryNotice{
		ID:          "maintenance",
		Audience:    telemetryNoticeAudiencePublic,
		Category:    "maintenance",
		Severity:    chroniclesdk.TelemetryNoticeSeverityWarning,
		Title:       "Scheduled maintenance",
		Message:     "Uploads may be briefly unavailable.",
		ActionLabel: ptrTo("Status"),
		ActionURL:   ptrTo("https://chronicleclassic.com"),
		StartsAt:    &startsAt,
		UpdatedAt:   updatedAt,
	}, telemetryNoticeToSDK(row))
}

func TestTelemetryNoticeHandlersFilterAudience(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.October, 4, 12, 0, 0, 0, time.UTC)
	api := &API{}
	list := func(context.Context) ([]database.TelemetryNotice, error) {
		return []database.TelemetryNotice{
			{ID: "public", Audience: telemetryNoticeAudiencePublic, UpdatedAt: pgtype.Timestamptz{Time: updatedAt, Valid: true}},
			{ID: "admin", Audience: telemetryNoticeAudienceAdmin, UpdatedAt: pgtype.Timestamptz{Time: updatedAt, Valid: true}},
		}, nil
	}

	tests := []struct {
		name     string
		audience string
		wantID   string
	}{
		{name: "public", audience: telemetryNoticeAudiencePublic, wantID: "public"},
		{name: "admin", audience: telemetryNoticeAudienceAdmin, wantID: "admin"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			recorder := httptest.NewRecorder()
			api.listTelemetryNotices(
				recorder,
				httptest.NewRequest(http.MethodGet, "/", nil),
				test.audience,
				list,
			)
			require.Equal(t, http.StatusOK, recorder.Code)

			var response chroniclesdk.TelemetryNoticesResponse
			require.NoError(t, json.NewDecoder(recorder.Body).Decode(&response))
			require.Len(t, response.Notices, 1)
			require.Equal(t, test.wantID, response.Notices[0].ID)
		})
	}
}

func ptrTo[T any](value T) *T {
	return &value
}
