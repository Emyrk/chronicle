package servicerankings

import (
	"context"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ratingEvidenceQuerier interface {
	GetInstanceRatingEvidenceRun(context.Context, database.GetInstanceRatingEvidenceRunParams) (database.GetInstanceRatingEvidenceRunRow, error)
	ListInstanceRatingPlayerObservations(context.Context, database.ListInstanceRatingPlayerObservationsParams) ([]database.ListInstanceRatingPlayerObservationsRow, error)
	ListInstanceRatingPlayerRenownFacts(context.Context, database.ListInstanceRatingPlayerRenownFactsParams) ([]database.ListInstanceRatingPlayerRenownFactsRow, error)
	ListInstanceRatingGuildBossObservations(context.Context, database.ListInstanceRatingGuildBossObservationsParams) ([]database.ListInstanceRatingGuildBossObservationsRow, error)
	ListInstanceRatingGuildClearObservations(context.Context, database.ListInstanceRatingGuildClearObservationsParams) ([]database.ListInstanceRatingGuildClearObservationsRow, error)
	ListInstanceRatingGuildRenownFacts(context.Context, database.ListInstanceRatingGuildRenownFactsParams) ([]database.ListInstanceRatingGuildRenownFactsRow, error)
}

func (s *Service) handleInstanceRatingEvidence(w http.ResponseWriter, r *http.Request) {
	handleInstanceRatingEvidenceWithStore(s.store, w, r)
}

func handleInstanceRatingEvidenceWithStore(store ratingEvidenceQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceID, err := uuid.Parse(chi.URLParam(r, "instanceID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid instance ID"})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	run, err := store.GetInstanceRatingEvidenceRun(ctx, database.GetInstanceRatingEvidenceRunParams{
		TenantID: tenantID, InstanceID: instanceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Instance not found"})
		return
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{
			Message: "Failed to resolve instance rating evidence", Detail: err.Error(),
		}})
		return
	}
	if run.Invalidated {
		httpapi.Write(ctx, w, http.StatusOK, unavailableRatingEvidence("invalid"))
		return
	}
	if !run.RepresentativeInstanceID.Valid {
		httpapi.Write(ctx, w, http.StatusOK, unavailableRatingEvidence("not_projected"))
		return
	}

	query := database.ListInstanceRatingPlayerObservationsParams{TenantID: tenantID, RunID: run.RunID}
	playerRows, err := store.ListInstanceRatingPlayerObservations(ctx, query)
	if err != nil {
		writeRatingEvidenceError(ctx, w, err)
		return
	}
	playerRenownRows, err := store.ListInstanceRatingPlayerRenownFacts(ctx, database.ListInstanceRatingPlayerRenownFactsParams(query))
	if err != nil {
		writeRatingEvidenceError(ctx, w, err)
		return
	}
	guildBossRows, err := store.ListInstanceRatingGuildBossObservations(ctx, database.ListInstanceRatingGuildBossObservationsParams(query))
	if err != nil {
		writeRatingEvidenceError(ctx, w, err)
		return
	}
	guildClearRows, err := store.ListInstanceRatingGuildClearObservations(ctx, database.ListInstanceRatingGuildClearObservationsParams(query))
	if err != nil {
		writeRatingEvidenceError(ctx, w, err)
		return
	}
	guildRenownRows, err := store.ListInstanceRatingGuildRenownFacts(ctx, database.ListInstanceRatingGuildRenownFactsParams(query))
	if err != nil {
		writeRatingEvidenceError(ctx, w, err)
		return
	}

	response := chroniclesdk.InstanceRatingEvidenceResponse{
		Available:                true,
		RunID:                    run.RunID,
		RepresentativeInstanceID: run.RepresentativeInstanceID.UUID,
		Player: chroniclesdk.InstanceRatingPlayerEvidence{
			Observations: make([]chroniclesdk.InstanceRatingPlayerObservation, 0, len(playerRows)),
			Renown:       make([]chroniclesdk.InstanceRatingPlayerRenownFact, 0, len(playerRenownRows)),
		},
		Guild: chroniclesdk.InstanceRatingGuildEvidence{
			BossTimes:  make([]chroniclesdk.InstanceRatingGuildBossObservation, 0, len(guildBossRows)),
			ClearTimes: make([]chroniclesdk.InstanceRatingGuildClearObservation, 0, len(guildClearRows)),
			Renown:     make([]chroniclesdk.InstanceRatingGuildRenownFact, 0, len(guildRenownRows)),
		},
	}

	for _, row := range playerRows {
		response.Player.Observations = append(response.Player.Observations, chroniclesdk.InstanceRatingPlayerObservation{
			EncounterName: row.EncounterName, PlayerGUID: row.PlayerGuid, PlayerName: row.PlayerName,
			PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec,
			Metric: row.Metric, MetricValue: row.MetricValue,
			SourceInstanceID: row.SourceInstanceID, SourceEncounterID: row.SourceEncounterID,
			SourceRankingID: row.SourceRankingID, ProjectionVersion: row.ProjectionVersion,
			ObservedAt: row.ObservedAt.Time,
		})
	}
	for _, row := range playerRenownRows {
		response.Player.Renown = append(response.Player.Renown, chroniclesdk.InstanceRatingPlayerRenownFact{
			EncounterName: row.EncounterName, PlayerGUID: row.PlayerGuid, PlayerName: row.PlayerName,
			SourceInstanceID: row.SourceInstanceID, SourceEncounterID: row.SourceEncounterID,
			ProjectionVersion: row.ProjectionVersion, ObservedAt: row.ObservedAt.Time,
		})
	}
	for _, row := range guildBossRows {
		response.Guild.BossTimes = append(response.Guild.BossTimes, chroniclesdk.InstanceRatingGuildBossObservation{
			EncounterName: row.EncounterName, GuildID: row.GuildID, GuildName: row.GuildName,
			DurationMs: row.DurationMs, SourceInstanceID: row.SourceInstanceID,
			SourceEncounterID: row.SourceEncounterID, SourceTimeParseScoreID: row.SourceTimeParseScoreID,
			ProjectionVersion: row.ProjectionVersion, ObservedAt: row.ObservedAt.Time,
		})
	}
	for _, row := range guildClearRows {
		response.Guild.ClearTimes = append(response.Guild.ClearTimes, chroniclesdk.InstanceRatingGuildClearObservation{
			GuildID: row.GuildID, GuildName: row.GuildName, DurationMs: row.DurationMs,
			SourceInstanceID: row.SourceInstanceID, SourceTimeParseScoreID: row.SourceTimeParseScoreID,
			ProjectionVersion: row.ProjectionVersion, ObservedAt: row.ObservedAt.Time,
		})
	}
	for _, row := range guildRenownRows {
		response.Guild.Renown = append(response.Guild.Renown, chroniclesdk.InstanceRatingGuildRenownFact{
			EncounterName: row.EncounterName, GuildID: row.GuildID, GuildName: row.GuildName,
			SourceInstanceID: row.SourceInstanceID, SourceEncounterID: row.SourceEncounterID,
			ProjectionVersion: row.ProjectionVersion, ObservedAt: row.ObservedAt.Time,
		})
	}

	if len(response.Player.Observations) == 0 && len(response.Player.Renown) == 0 &&
		len(response.Guild.BossTimes) == 0 && len(response.Guild.ClearTimes) == 0 && len(response.Guild.Renown) == 0 {
		httpapi.Write(ctx, w, http.StatusOK, unavailableRatingEvidence("no_evidence"))
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, response)
}

func unavailableRatingEvidence(reason string) chroniclesdk.InstanceRatingEvidenceResponse {
	return chroniclesdk.InstanceRatingEvidenceResponse{
		Available: false,
		Reason:    reason,
		Player: chroniclesdk.InstanceRatingPlayerEvidence{
			Observations: []chroniclesdk.InstanceRatingPlayerObservation{},
			Renown:       []chroniclesdk.InstanceRatingPlayerRenownFact{},
		},
		Guild: chroniclesdk.InstanceRatingGuildEvidence{
			BossTimes:  []chroniclesdk.InstanceRatingGuildBossObservation{},
			ClearTimes: []chroniclesdk.InstanceRatingGuildClearObservation{},
			Renown:     []chroniclesdk.InstanceRatingGuildRenownFact{},
		},
	}
}

func writeRatingEvidenceError(ctx context.Context, w http.ResponseWriter, err error) {
	httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{
		Message: "Failed to load instance rating evidence", Detail: err.Error(),
	}})
}
