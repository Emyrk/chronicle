package serviceratings

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

// ComputeProjection reads one canonical run in one SQL statement snapshot without
// dirty/source locks. Empty/missing stages are valid. It is shared with future
// direct writers; no D1 queue hop is required to compute or publish evidence.
func ComputeProjection(ctx context.Context, tx database.StoreQueries, tenant, run uuid.UUID) ([]database.ProjectLeaderboardRunRow, error) {
	if servicetenant.IsBypass(ctx) {
		return nil, fmt.Errorf("projection requires tenant context")
	}
	if servicetenant.TenantIDFromContext(ctx) != tenant {
		return nil, fmt.Errorf("projection tenant mismatch")
	}
	return tx.ProjectLeaderboardRun(ctx, database.ProjectLeaderboardRunParams{TenantID: tenant, RunID: run})
}

// PublishProjectionTx requires an open tenant transaction and its dirty-run row
// lock (owned D1 claim or LockLeaderboardDirectPublication). It captures OLD keys
// here, not at compute time: a direct writer may have published another cohort.
// Caller must roll back on any error. No source locks, D2 calculations or commits.
func PublishProjectionTx(ctx context.Context, tx database.StoreQueries, tenant, run uuid.UUID, rows []database.ProjectLeaderboardRunRow) error {
	if servicetenant.IsBypass(ctx) || servicetenant.TenantIDFromContext(ctx) != tenant {
		return fmt.Errorf("publication tenant mismatch")
	}
	return publishProjectionTx(ctx, tx, tenant, run, rows)
}

// Internal integration boundary also supports existing privileged source
// transactions. Every statement remains explicitly qualified by tenant/run.
func publishProjectionTx(ctx context.Context, tx database.StoreQueries, tenant, run uuid.UUID, rows []database.ProjectLeaderboardRunRow) error {
	for _, r := range rows {
		if !r.TenantID.Valid || r.TenantID.UUID != tenant || r.RunID != run || r.Kind < 1 || r.Kind > 8 {
			return fmt.Errorf("invalid projection identity")
		}
	}
	identities := database.RememberLeaderboardCareerRunIdentitiesParams{TenantID: tenant, RunID: run}
	if err := tx.RememberLeaderboardCareerRunIdentities(ctx, identities); err != nil {
		return err
	}
	scope := database.EnqueueLeaderboardRunEvidenceScopesParams{TenantID: tenant, RunID: run}
	if err := tx.EnqueueLeaderboardRunEvidenceScopes(ctx, scope); err != nil {
		return err
	}
	if err := tx.DeleteLeaderboardRunEvidence(ctx, database.DeleteLeaderboardRunEvidenceParams{TenantID: tenant, RunID: run}); err != nil {
		return err
	}
	{
		params := make([]database.ReplaceLeaderboardCareerRenownFactParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardCareerRenownFact(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 6 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardCareerRenownFactParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, PlayerGuid: r.PlayerGuid, PlayerClass: r.PlayerClass, PlayerSpec: r.PlayerSpec, PlayerSubSpec: r.PlayerSubSpec, SourceEncounterID: r.SourceEncounterID})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardPlayerObservationParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardPlayerObservation(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 1 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardPlayerObservationParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, PlayerGuid: r.PlayerGuid, SourceEncounterID: r.SourceEncounterID, SourceRankingID: r.SourceRankingID, PlayerClass: r.PlayerClass, PlayerSpec: r.PlayerSpec, PlayerSubSpec: r.PlayerSubSpec, Metric: r.Metric, MetricValue: r.MetricValue})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardGuildBossObservationParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardGuildBossObservation(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 2 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardGuildBossObservationParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, GuildID: r.GuildID, SourceTimeParseScoreID: r.SourceTimeParseScoreID, SourceEncounterID: r.SourceEncounterID, DurationMs: r.DurationMs})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardVariantPlayerObservationParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardVariantPlayerObservation(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 7 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardVariantPlayerObservationParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, EncounterVariant: r.EncounterVariant, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, PlayerGuid: r.PlayerGuid, SourceEncounterID: r.SourceEncounterID, SourceRankingID: r.SourceRankingID, PlayerClass: r.PlayerClass, PlayerSpec: r.PlayerSpec, PlayerSubSpec: r.PlayerSubSpec, Metric: r.Metric, MetricValue: r.MetricValue})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardVariantGuildBossObservationParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardVariantGuildBossObservation(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 8 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardVariantGuildBossObservationParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, EncounterVariant: r.EncounterVariant, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, GuildID: r.GuildID, SourceTimeParseScoreID: r.SourceTimeParseScoreID, SourceEncounterID: r.SourceEncounterID, DurationMs: r.DurationMs})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardGuildClearObservationParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardGuildClearObservation(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 3 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardGuildClearObservationParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, GuildID: r.GuildID, SourceTimeParseScoreID: r.SourceTimeParseScoreID, DurationMs: r.DurationMs})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardPlayerRenownFactParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardPlayerRenownFact(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 4 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardPlayerRenownFactParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, PlayerGuid: r.PlayerGuid, SourceEncounterID: r.SourceEncounterID})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	{
		params := make([]database.ReplaceLeaderboardGuildRenownFactParams, 0, BatchSize)
		flush := func() error {
			if len(params) == 0 {
				return nil
			}
			err := consume(tx.ReplaceLeaderboardGuildRenownFact(ctx, params))
			params = params[:0]
			return err
		}
		for _, r := range rows {
			if r.Kind != 5 {
				continue
			}
			params = append(params, database.ReplaceLeaderboardGuildRenownFactParams{TenantID: tenant, InstanceName: r.InstanceName, DifficultyName: r.DifficultyName, MaxPlayers: r.MaxPlayers, EncounterName: r.EncounterName, RunID: r.RunID, SourceInstanceID: r.SourceInstanceID, RealmID: r.RealmID, GuildID: r.GuildID, SourceEncounterID: r.SourceEncounterID})
			if len(params) == BatchSize {
				if err := flush(); err != nil {
					return err
				}
			}
		}
		if err := flush(); err != nil {
			return err
		}
	}
	if err := tx.RememberLeaderboardCareerRunIdentities(ctx, identities); err != nil {
		return err
	}
	if err := tx.EnqueueLeaderboardCareer(ctx, tenant); err != nil {
		return err
	}
	return tx.EnqueueLeaderboardRunEvidenceScopes(ctx, scope)
}
