package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type telemetryNoticeTestRow struct {
	ID          string
	Audience    string
	Category    string
	Severity    string
	Title       string
	Message     string
	ActionLabel pgtype.Text
	ActionUrl   pgtype.Text
	StartsAt    pgtype.Timestamptz
	ExpiresAt   pgtype.Timestamptz
	UpdatedAt   pgtype.Timestamptz
}

type telemetryNoticeTestStore struct {
	public []telemetryNoticeTestRow
	admin  []telemetryNoticeTestRow
}

func (s telemetryNoticeTestStore) ListActivePublicTelemetryNotices(context.Context) ([]telemetryNoticeTestRow, error) {
	return s.public, nil
}

func (s telemetryNoticeTestStore) ListActiveAdminTelemetryNotices(context.Context) ([]telemetryNoticeTestRow, error) {
	return s.admin, nil
}

func TestCallTelemetryNoticeList(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.October, 4, 12, 0, 0, 0, time.UTC)
	startsAt := updatedAt.Add(-time.Hour)
	store := telemetryNoticeTestStore{
		public: []telemetryNoticeTestRow{{
			ID:          "maintenance",
			Audience:    telemetryNoticeAudiencePublic,
			Category:    "service",
			Severity:    "warning",
			Title:       "Scheduled maintenance",
			Message:     "Uploads may be briefly unavailable.",
			ActionLabel: pgtype.Text{String: "Status", Valid: true},
			ActionUrl:   pgtype.Text{String: "https://status.example.com", Valid: true},
			StartsAt:    pgtype.Timestamptz{Time: startsAt, Valid: true},
			UpdatedAt:   pgtype.Timestamptz{Time: updatedAt, Valid: true},
		}},
	}

	notices, err := callTelemetryNoticeList(context.Background(), store, "ListActivePublicTelemetryNotices")
	require.NoError(t, err)
	require.Equal(t, []chroniclesdk.TelemetryNotice{{
		ID:          "maintenance",
		Audience:    telemetryNoticeAudiencePublic,
		Category:    "service",
		Severity:    chroniclesdk.TelemetryNoticeSeverityWarning,
		Title:       "Scheduled maintenance",
		Message:     "Uploads may be briefly unavailable.",
		ActionLabel: ptrTo("Status"),
		ActionURL:   ptrTo("https://status.example.com"),
		StartsAt:    &startsAt,
		UpdatedAt:   updatedAt,
	}}, notices)
}

func TestTelemetryNoticeHandlersFilterAudience(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.October, 4, 12, 0, 0, 0, time.UTC)
	api := &API{}
	list := func(_ context.Context, _ string) ([]chroniclesdk.TelemetryNotice, error) {
		return []chroniclesdk.TelemetryNotice{
			{ID: "public", Audience: telemetryNoticeAudiencePublic, UpdatedAt: updatedAt},
			{ID: "admin", Audience: telemetryNoticeAudienceAdmin, UpdatedAt: updatedAt},
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
