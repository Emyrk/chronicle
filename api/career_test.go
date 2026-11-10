package api

import (
	"context"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/stretchr/testify/require"
)

type careerOwnershipFixture struct {
	server database.WowServer
}

func (f careerOwnershipFixture) GetWoWServerRealm(context.Context, uuid.UUID) (database.WowServerRealm, error) {
	return database.WowServerRealm{ServerID: f.server.ID}, nil
}
func (f careerOwnershipFixture) GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error) {
	return f.server, nil
}

func TestCareerRealmOwnership(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	for _, tc := range []struct {
		name    string
		owner   uuid.NullUUID
		allowed bool
	}{
		{"same tenant", uuid.NullUUID{UUID: tenant, Valid: true}, true},
		{"foreign tenant", uuid.NullUUID{UUID: uuid.New(), Valid: true}, false},
		{"unowned server", uuid.NullUUID{}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := careerRealmOwnership(t.Context(), careerOwnershipFixture{database.WowServer{ID: uuid.New(), TenantID: tc.owner}}, tenant, uuid.New())
			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, pgx.ErrNoRows)
				rec := httptest.NewRecorder()
				writeCareerError(rec, httptest.NewRequest(http.MethodGet, "/career", nil), err)
				require.Equal(t, http.StatusNotFound, rec.Code)
			}
		})
	}
}

func TestCareerTenantScope(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"root", "tenant", "tenant_id", "dataset", "metric", "weight", "unknown"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(http.MethodGet, "/career", nil)
			if name != "root" {
				req = req.WithContext(servicetenant.WithTenant(req.Context(), database.Tenant{ID: uuid.New()}))
				req.URL.RawQuery = name + "=override"
			}
			rec := httptest.NewRecorder()
			require.Nil(t, careerTenant(rec, req))
			require.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
	t.Run("request tenant", func(t *testing.T) {
		t.Parallel()
		tenant := database.Tenant{ID: uuid.New()}
		req := httptest.NewRequest(http.MethodGet, "/career", nil)
		req = req.WithContext(servicetenant.WithTenant(req.Context(), tenant))
		require.Equal(t, tenant.ID, careerTenant(httptest.NewRecorder(), req).ID)
	})
}

func TestCareerSummaryTransport(t *testing.T) {
	t.Parallel()
	for _, metric := range []string{"dps", "hps", "kill_time"} {
		t.Run(metric, func(t *testing.T) {
			t.Parallel()
			zero := 0.0
			input := serviceratings.CareerSummary{
				ChosenMetric: &metric, Mastery: &zero, Peak: &zero,
				Renown: 12, PerformanceStatus: "ready", RefreshPending: true,
				Contributions: []serviceratings.CareerContribution{
					{CareerKey: leaderboardconfig.CareerKey{Instance: "Raid", Difficulty: "Heroic", MaxPlayers: 25}, IncludeAverage: true},
					{CareerKey: leaderboardconfig.CareerKey{Instance: "Obsidian Sanctum", Difficulty: "10 Player", MaxPlayers: 10}, IncludeRenown: true, Renown: 12},
				},
			}
			out := careerSummary(input)
			require.NotNil(t, out.Mastery)
			require.Zero(t, *out.Mastery)
			require.Equal(t, 12.0, out.Renown)
			require.True(t, out.RefreshPending)
			if metric == "kill_time" {
				require.Nil(t, out.ChosenMetric)
			} else {
				require.Equal(t, metric, *out.ChosenMetric)
			}
			require.NotNil(t, out.Contributions[0].Mastery)
			require.Equal(t, "Heroic", out.Contributions[0].DifficultyName)
			require.Equal(t, int16(25), out.Contributions[0].MaxPlayers)
			require.Nil(t, out.Contributions[1].Mastery)
			require.Nil(t, out.Contributions[1].Peak)
			require.Equal(t, 12.0, out.Contributions[1].Renown)
		})
	}
}

func TestCareerUnsupportedModeResponse(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	writeCareerError(rec, httptest.NewRequest(http.MethodGet, "/career", nil), serviceratings.ErrCareerUnsupportedMode)
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "scoring mode")
}

func TestCareerSummaryTransportPreparing(t *testing.T) {
	t.Parallel()
	out := careerSummary(serviceratings.CareerSummary{PerformanceStatus: "preparing"})
	require.Nil(t, out.Mastery)
	require.Nil(t, out.Peak)
	require.Nil(t, out.ChosenMetric)
	require.NotNil(t, out.Contributions)
	require.Empty(t, out.Contributions)
	require.NotNil(t, careerIssues(nil))
}
