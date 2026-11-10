package api

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// careerTenant requires the request's tenant scope. Public callers cannot change
// the pool, weights, or persisted metric choice through query parameters.
func careerTenant(w http.ResponseWriter, r *http.Request) *database.Tenant {
	ctx := r.Context()
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Open a tenant site to view career scores."})
		return nil
	}
	if len(r.URL.Query()) != 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Career scores do not accept scope or metric overrides."})
		return nil
	}
	return tenant
}

func (api *API) GetArmoryPlayerCareer(w http.ResponseWriter, r *http.Request) {
	tenant := careerTenant(w, r)
	if tenant == nil {
		return
	}
	player, realm, ok := api.resolveArmoryPlayer(w, r)
	if !ok {
		return
	}
	db := database.New(api.Opts.Pool)
	if err := careerRealmOwnership(r.Context(), db, tenant.ID, realm); err != nil {
		writeCareerError(w, r, err)
		return
	}
	result, err := serviceratings.ReadPlayerCareer(r.Context(), db, tenant.ID, realm, player.ID.String())
	if err != nil {
		writeCareerError(w, r, err)
		return
	}
	out := chroniclesdk.CareerPlayerResponse{
		Status: result.Status, PoolFingerprint: result.PoolFingerprint,
		Issues: careerIssues(result.Issues), Cohorts: []chroniclesdk.CareerPlayerCohort{},
	}
	for _, cohort := range result.Cohorts {
		out.Cohorts = append(out.Cohorts, chroniclesdk.CareerPlayerCohort{
			PlayerClass: cohort.PlayerClass, PlayerSpec: cohort.PlayerSpec,
			PlayerSubSpec: cohort.PlayerSubSpec, Summary: careerSummary(cohort.CareerSummary),
		})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}

func (api *API) GetGuildCareer(w http.ResponseWriter, r *http.Request) {
	tenant := careerTenant(w, r)
	if tenant == nil {
		return
	}
	guild := httpmw.Guild(r.Context())
	db := database.New(api.Opts.Pool)
	if err := careerRealmOwnership(r.Context(), db, tenant.ID, guild.RealmID); err != nil {
		writeCareerError(w, r, err)
		return
	}
	result, err := serviceratings.ReadGuildCareer(r.Context(), db, tenant.ID, guild.ID)
	if err != nil {
		writeCareerError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.CareerGuildResponse{
		Status: result.PerformanceStatus, PoolFingerprint: result.PoolFingerprint,
		Issues: careerIssues(result.Issues), Summary: careerSummary(result),
	})
}

type careerRealmStore interface {
	GetWoWServerRealm(context.Context, uuid.UUID) (database.WowServerRealm, error)
	GetWoWServer(context.Context, uuid.UUID) (database.WowServer, error)
}

func careerRealmOwnership(ctx context.Context, db careerRealmStore, tenant, realm uuid.UUID) error {
	row, err := db.GetWoWServerRealm(ctx, realm)
	if err != nil {
		return err
	}
	server, err := db.GetWoWServer(ctx, row.ServerID)
	if err != nil {
		return err
	}
	if !server.TenantID.Valid || server.TenantID.UUID != tenant {
		return pgx.ErrNoRows
	}
	return nil
}

func writeCareerError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Career subject not found on this tenant."})
	case errors.Is(err, serviceratings.ErrCareerUnsupportedMode):
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Player career scoring is not available for this tenant's scoring mode."})
	default:
		httpapi.InternalServerError(w, err)
	}
}

func careerIssues(issues []leaderboardconfig.CareerIssue) []chroniclesdk.CareerIssue {
	out := make([]chroniclesdk.CareerIssue, 0, len(issues))
	for _, issue := range issues {
		out = append(out, chroniclesdk.CareerIssue{
			InstanceName: issue.Instance, DifficultyName: issue.Difficulty,
			MaxPlayers: issue.MaxPlayers, Code: issue.Code,
		})
	}
	return out
}

func careerSummary(summary serviceratings.CareerSummary) chroniclesdk.CareerSummary {
	out := chroniclesdk.CareerSummary{
		Mastery: summary.Mastery, Peak: summary.Peak, Renown: summary.Renown,
		ChosenMetric: summary.ChosenMetric, PerformanceStatus: summary.PerformanceStatus,
		ComputedAt: summary.ComputedAt, RefreshPending: summary.RefreshPending,
		Contributions: make([]chroniclesdk.CareerContribution, 0, len(summary.Contributions)),
	}
	// Guilds use kill-time inputs, not a player DPS/HPS choice.
	if out.ChosenMetric != nil && *out.ChosenMetric == "kill_time" {
		out.ChosenMetric = nil
	}
	for _, contribution := range summary.Contributions {
		row := chroniclesdk.CareerContribution{
			InstanceName: contribution.Instance, DifficultyName: contribution.Difficulty,
			MaxPlayers: contribution.MaxPlayers, Weight: contribution.Weight,
			IncludeAverage: contribution.IncludeAverage, IncludeRenown: contribution.IncludeRenown,
			Renown: contribution.Renown, EligibleMetricKills: contribution.EligibleMetricKills,
			EligibleRenownKills: contribution.EligibleRenownKills,
		}
		// Renown-only raids have no performance contribution, rather than a zero score.
		// A missing metric choice likewise must not appear as a measured zero.
		if contribution.IncludeAverage && summary.ChosenMetric != nil {
			mastery, peak := contribution.Mastery, contribution.Peak
			row.Mastery, row.Peak = &mastery, &peak
		}
		out.Contributions = append(out.Contributions, row)
	}
	return out
}
