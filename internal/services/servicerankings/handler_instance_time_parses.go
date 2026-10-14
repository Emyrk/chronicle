package servicerankings

import (
	"context"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type timeParsesQuerier interface {
	InstanceBySlug(context.Context, pgtype.Text) (database.LogInstancesGuild, error)
	GetTenantByID(context.Context, uuid.UUID) (database.Tenant, error)
	GetTimeParseScoreReceiptForContract(context.Context, database.GetTimeParseScoreReceiptForContractParams) (database.TimeParseScoreReceipt, error)
	ListTimeParseScoreResultsForReceipt(context.Context, uuid.UUID) ([]database.TimeParseScoreResult, error)
}

func (s *Service) handleInstanceTimeParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceTimeParsesWithStore(s.store, w, r)
}

func handleInstanceTimeParsesWithStore(store timeParsesQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceIDText := chi.URLParam(r, "instanceID")
	instanceID, err := uuid.Parse(instanceIDText)
	if err != nil {
		instance, slugErr := store.InstanceBySlug(ctx, pgtype.Text{String: instanceIDText, Valid: true})
		if slugErr != nil {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Instance not found"})
			return
		}
		instanceID = instance.ID
	}
	tenantID := servicetenant.TenantIDFromContext(ctx)
	if tenantID != uuid.Nil {
		tenant, tenantErr := store.GetTenantByID(ctx, tenantID)
		if tenantErr == nil && len(tenant.ParseConfig) > 0 && isParseDisabled(tenant.ParseConfig) {
			httpapi.Write(ctx, w, http.StatusOK, unavailableTimeParses("disabled"))
			return
		}
	}
	receipt, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{
		TenantID: tenantID, InstanceID: instanceID, LookbackDays: TimeParseScoreLookbackDays,
		PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: timeparsepolicy.QueryVersion,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusOK, unavailableTimeParses("not_computed"))
		return
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to load time parse receipt", Detail: err.Error()}})
		return
	}
	rows, err := store.ListTimeParseScoreResultsForReceipt(ctx, receipt.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to load time parse scores", Detail: err.Error()}})
		return
	}
	scopes := map[string]chroniclesdk.TimeParseScopeResult{
		TimeParseScopeServer: {Reason: "no_time_data", BossKillTimes: []chroniclesdk.BossKillTimeParse{}},
		TimeParseScopeRealm:  {Reason: "no_time_data", BossKillTimes: []chroniclesdk.BossKillTimeParse{}},
		TimeParseScopeGuild:  {Reason: "no_guild", BossKillTimes: []chroniclesdk.BossKillTimeParse{}},
	}
	if receipt.GuildID.Valid {
		scopes[TimeParseScopeGuild] = chroniclesdk.TimeParseScopeResult{Reason: "no_time_data", BossKillTimes: []chroniclesdk.BossKillTimeParse{}}
	}
	precise := make(map[string][]float64)
	for _, row := range rows {
		scope := scopes[row.Scope]
		scope.Available = true
		scope.Reason = ""
		score := chroniclesdk.TimeParseScore{DurationMs: row.DurationMs, PreciseScore: row.PreciseScore, DisplayScore: int(row.DisplayScore), Rank: int(row.Rank), SampleSize: int(row.SampleSize), Status: row.Status}
		if row.MetricKind == "clear_time" {
			scope.ClearTime = &score
		} else if row.EncounterID.Valid {
			scope.BossKillTimes = append(scope.BossKillTimes, chroniclesdk.BossKillTimeParse{
				EncounterID: row.EncounterID.UUID, EncounterName: row.EncounterName,
				DurationMs: row.DurationMs, PreciseScore: row.PreciseScore, DisplayScore: int(row.DisplayScore),
				Rank: int(row.Rank), SampleSize: int(row.SampleSize), Status: row.Status,
			})
			if row.Status != string(timeparsepolicy.StatusSampleTooSmall) {
				precise[row.Scope] = append(precise[row.Scope], row.PreciseScore)
			}
		}
		scopes[row.Scope] = scope
	}
	for name, scope := range scopes {
		if average, ok := timeparsepolicy.AverageParse(precise[name], len(scope.BossKillTimes)); ok {
			scope.AverageBossKillParse = &chroniclesdk.TimeParseAverage{PreciseScore: average.PreciseScore, DisplayScore: average.DisplayScore, Killed: average.Killed, Selected: average.Selected}
			scopes[name] = scope
		}
	}
	server := scopes[TimeParseScopeServer]
	resp := chroniclesdk.InstanceTimeParsesResponse{
		Available: server.Available, Reason: server.Reason, Cutoff: receipt.Cutoff.Time,
		WindowStart: &receipt.WindowStart.Time, LookbackDays: int32(receipt.LookbackDays),
		PolicyVersion: receipt.PolicyVersion, QueryVersion: receipt.QueryVersion, ComputedAt: receipt.ComputedAt.Time,
		Scopes: scopes, ClearTime: server.ClearTime, BossKillTimes: server.BossKillTimes, AverageBossKillParse: server.AverageBossKillParse,
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func unavailableTimeParses(reason string) chroniclesdk.InstanceTimeParsesResponse {
	return chroniclesdk.InstanceTimeParsesResponse{Available: false, Reason: reason, BossKillTimes: []chroniclesdk.BossKillTimeParse{}, Scopes: map[string]chroniclesdk.TimeParseScopeResult{}}
}
