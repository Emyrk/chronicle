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
	GetTimeParseScoreForContract(context.Context, database.GetTimeParseScoreForContractParams) (database.TimeParseScore, error)
	ListTimeParseBossScoresForScore(context.Context, uuid.UUID) ([]database.TimeParseBossScore, error)
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
	score, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
		TenantID: tenantID, InstanceID: instanceID, LookbackDays: TimeParseScoreLookbackDays,
		PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: timeparsepolicy.QueryVersion,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusOK, unavailableTimeParses("not_computed"))
		return
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to load time parse score", Detail: err.Error()}})
		return
	}
	bossRows, err := store.ListTimeParseBossScoresForScore(ctx, score.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to load time parse boss scores", Detail: err.Error()}})
		return
	}
	scopes := map[string]chroniclesdk.TimeParseScopeResult{
		TimeParseScopeServer: {Reason: "no_time_data", BossKillTimes: []chroniclesdk.BossKillTimeParse{}},
		TimeParseScopeRealm:  {Reason: "no_time_data", BossKillTimes: []chroniclesdk.BossKillTimeParse{}},
		TimeParseScopeGuild:  {Reason: "no_guild", BossKillTimes: []chroniclesdk.BossKillTimeParse{}},
	}
	if score.GuildID.Valid {
		scopes[TimeParseScopeGuild] = chroniclesdk.TimeParseScopeResult{Reason: "no_time_data", BossKillTimes: []chroniclesdk.BossKillTimeParse{}}
	}
	setClear := func(scopeName string, precise pgtype.Float8, display pgtype.Int2, rank pgtype.Int4, sampleSize pgtype.Int4, status pgtype.Text) {
		if !score.ClearDurationMs.Valid || !status.Valid {
			return
		}
		scope := scopes[scopeName]
		scope.Available = true
		scope.Reason = ""
		scope.ClearTime = &chroniclesdk.TimeParseScore{
			DurationMs: score.ClearDurationMs.Int64, PreciseScore: precise.Float64, DisplayScore: int(display.Int16),
			Rank: int(rank.Int32), SampleSize: int(sampleSize.Int32), Status: status.String,
		}
		scopes[scopeName] = scope
	}
	setClear(TimeParseScopeServer, score.ClearServerPreciseScore, score.ClearServerDisplayScore, score.ClearServerRank, score.ClearServerSampleSize, score.ClearServerStatus)
	setClear(TimeParseScopeRealm, score.ClearRealmPreciseScore, score.ClearRealmDisplayScore, score.ClearRealmRank, score.ClearRealmSampleSize, score.ClearRealmStatus)
	setClear(TimeParseScopeGuild, score.ClearGuildPreciseScore, score.ClearGuildDisplayScore, score.ClearGuildRank, score.ClearGuildSampleSize, score.ClearGuildStatus)

	precise := make(map[string][]float64)
	appendBoss := func(scopeName string, row database.TimeParseBossScore, preciseScore float64, displayScore int16, rank int32, sampleSize int32, status string) {
		scope := scopes[scopeName]
		scope.Available = true
		scope.Reason = ""
		scope.BossKillTimes = append(scope.BossKillTimes, chroniclesdk.BossKillTimeParse{
			EncounterID: row.EncounterID, EncounterName: row.EncounterName, DurationMs: row.DurationMs,
			PreciseScore: preciseScore, DisplayScore: int(displayScore), Rank: int(rank), SampleSize: int(sampleSize), Status: status,
		})
		if status != string(timeparsepolicy.StatusSampleTooSmall) {
			precise[scopeName] = append(precise[scopeName], preciseScore)
		}
		scopes[scopeName] = scope
	}
	for _, row := range bossRows {
		appendBoss(TimeParseScopeServer, row, row.ServerPreciseScore, row.ServerDisplayScore, row.ServerRank, row.ServerSampleSize, row.ServerStatus)
		appendBoss(TimeParseScopeRealm, row, row.RealmPreciseScore, row.RealmDisplayScore, row.RealmRank, row.RealmSampleSize, row.RealmStatus)
		if row.GuildStatus.Valid {
			appendBoss(TimeParseScopeGuild, row, row.GuildPreciseScore.Float64, row.GuildDisplayScore.Int16, row.GuildRank.Int32, row.GuildSampleSize.Int32, row.GuildStatus.String)
		}
	}
	for name, scope := range scopes {
		if average, ok := timeparsepolicy.AverageParse(precise[name], len(scope.BossKillTimes)); ok {
			scope.AverageBossKillParse = &chroniclesdk.TimeParseAverage{PreciseScore: average.PreciseScore, DisplayScore: average.DisplayScore, Killed: average.Killed, Selected: average.Selected}
			scopes[name] = scope
		}
	}
	server := scopes[TimeParseScopeServer]
	resp := chroniclesdk.InstanceTimeParsesResponse{
		Available: true, Cutoff: score.Cutoff.Time,
		WindowStart: &score.WindowStart.Time, LookbackDays: int32(score.LookbackDays),
		PolicyVersion: score.PolicyVersion, QueryVersion: score.QueryVersion, ComputedAt: score.ComputedAt.Time,
		Scopes: scopes, ClearTime: server.ClearTime, BossKillTimes: server.BossKillTimes, AverageBossKillParse: server.AverageBossKillParse,
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func unavailableTimeParses(reason string) chroniclesdk.InstanceTimeParsesResponse {
	return chroniclesdk.InstanceTimeParsesResponse{Available: false, Reason: reason, BossKillTimes: []chroniclesdk.BossKillTimeParse{}, Scopes: map[string]chroniclesdk.TimeParseScopeResult{}}
}
