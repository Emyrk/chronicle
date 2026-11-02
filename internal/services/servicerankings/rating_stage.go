package servicerankings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/google/uuid"
)

// Rating evidence is staged in independent, restartable transactions. The
// checkpoint cursor only moves in the same transaction as the evidence writes.
const ratingStagePageSize int32 = 100

type ratingStageCursor struct {
	Run       uuid.UUID `json:"run,omitempty"`
	Realm     uuid.UUID `json:"realm,omitempty"`
	Player    string    `json:"player,omitempty"`
	Guild     uuid.UUID `json:"guild,omitempty"`
	Encounter string    `json:"encounter,omitempty"`
}

func advanceRatingStage(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint, phase string, cursor ratingStageCursor) error {
	next, err := json.Marshal(cursor)
	if err != nil {
		return err
	}
	n, err := tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
		TenantID: cp.TenantID, GenerationID: cp.GenerationID, ExpectedPhase: cp.Phase,
		ExpectedCursor: cp.Cursor, NextPhase: phase, NextCursor: next,
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("rating rebuild checkpoint changed during %s", cp.Phase)
	}
	return nil
}

// stageRatingEvidencePage stages one bounded source page, or transitions a
// completed source phase. It deliberately never marks the build ready: only a
// completed projection may do so. Return true once the projection may begin.
func stageRatingEvidencePage(ctx context.Context, store database.Store, tenant, generation uuid.UUID, tenantWriter bool) (bool, error) {
	staged := false
	stale := false
	err := store.InTx(ctx, func(tx database.Store) error {
		cp, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		// Never let the scheduled group pipeline resume and publish a tenant
		// checkpoint before its tenant score and scope projections exist.
		var writer struct {
			Writer string `json:"writer"`
		}
		if len(cp.Manifest) > 0 {
			if err := json.Unmarshal(cp.Manifest, &writer); err != nil {
				return fmt.Errorf("invalid rating checkpoint manifest: %w", err)
			}
		}
		if (writer.Writer == "tenant") != tenantWriter {
			return fmt.Errorf("rating checkpoint belongs to a different writer")
		}
		revision, err := tx.GetRatingConfigRevision(ctx, tenant)
		if err != nil {
			return err
		}
		if revision != cp.ConfigRevision {
			if _, err := tx.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{TenantID: tenant, GenerationID: generation}); err != nil {
				return err
			}
			stale = true
			return nil
		}
		var c ratingStageCursor
		if err := json.Unmarshal(cp.Cursor, &c); err != nil {
			return fmt.Errorf("invalid rating stage cursor: %w", err)
		}
		cutoff := cp.SourceCutoff
		next := c
		switch cp.Phase {
		case "runs":
			ids, err := tx.ListRatingStageRunsForTenant(ctx, database.ListRatingStageRunsForTenantParams{
				TenantID: tenant, AfterRunID: c.Run, SourceCutoff: cutoff, BatchSize: ratingStagePageSize,
			})
			if err != nil {
				return err
			}
			if len(ids) == 0 {
				return advanceRatingStage(ctx, tx, cp, "player_renown", ratingStageCursor{})
			}
			for _, metric := range []string{"dps", "hps"} {
				_, err = tx.StageRatingPlayerRuns(ctx, database.StageRatingPlayerRunsParams{TenantID: tenant, GenerationID: generation, SourceCutoff: cutoff, RunIds: ids, Metric: metric})
				if err != nil {
					return err
				}
			}
			_, err = tx.StageRatingGuildRuns(ctx, database.StageRatingGuildRunsParams{TenantID: tenant, GenerationID: generation, SourceCutoff: cutoff, RunIds: ids})
			if err != nil {
				return err
			}
			next.Run = ids[len(ids)-1]
		case "player_renown", "guild_renown":
			if c.Realm == uuid.Nil {
				realms, err := tx.ListRatingStageRealms(ctx, database.ListRatingStageRealmsParams{TenantID: tenant, AfterRealmID: uuid.Nil, BatchSize: 1})
				if err != nil {
					return err
				}
				if len(realms) == 0 {
					return finishRatingStage(ctx, tx, cp)
				}
				next.Realm = realms[0]
				return advanceRatingStage(ctx, tx, cp, cp.Phase, next)
			}
			if cp.Phase == "player_renown" {
				args := database.ListRatingPlayerRenownSourcePageParams{RealmID: c.Realm, AfterPlayerGuid: c.Player, AfterRunID: c.Run, AfterEncounterName: c.Encounter, SourceCutoff: cutoff, BatchSize: ratingStagePageSize}
				rows, err := tx.ListRatingPlayerRenownSourcePage(ctx, args)
				if err != nil {
					return err
				}
				if len(rows) > 0 {
					_, err = tx.StageRatingPlayerRenownPage(ctx, database.StageRatingPlayerRenownPageParams{GenerationID: generation, TenantID: tenant, RealmID: c.Realm, AfterPlayerGuid: c.Player, AfterRunID: c.Run, AfterEncounterName: c.Encounter, SourceCutoff: cutoff, BatchSize: ratingStagePageSize})
					if err != nil {
						return err
					}
					last := rows[len(rows)-1]
					next.Player = last.PlayerGuid
					next.Run = last.RunID
					next.Encounter = last.EncounterName
					return advanceRatingStage(ctx, tx, cp, cp.Phase, next)
				}
			} else {
				args := database.ListRatingGuildRenownSourcePageParams{TenantID: tenant, RealmID: c.Realm, AfterGuildID: c.Guild, AfterRunID: c.Run, AfterEncounterName: c.Encounter, SourceCutoff: cutoff, BatchSize: ratingStagePageSize}
				rows, err := tx.ListRatingGuildRenownSourcePage(ctx, args)
				if err != nil {
					return err
				}
				if len(rows) > 0 {
					_, err = tx.StageRatingGuildRenownPage(ctx, database.StageRatingGuildRenownPageParams{GenerationID: generation, TenantID: tenant, RealmID: c.Realm, AfterGuildID: c.Guild, AfterRunID: c.Run, AfterEncounterName: c.Encounter, SourceCutoff: cutoff, BatchSize: ratingStagePageSize})
					if err != nil {
						return err
					}
					last := rows[len(rows)-1]
					next.Guild = last.GuildID
					next.Run = last.RunID
					next.Encounter = last.EncounterName
					return advanceRatingStage(ctx, tx, cp, cp.Phase, next)
				}
			}
			realms, err := tx.ListRatingStageRealms(ctx, database.ListRatingStageRealmsParams{TenantID: tenant, AfterRealmID: c.Realm, BatchSize: 1})
			if err != nil {
				return err
			}
			if len(realms) == 0 {
				return finishRatingStage(ctx, tx, cp)
			}
			next = ratingStageCursor{Realm: realms[0]}
		default:
			staged = true
			return nil
		}
		return advanceRatingStage(ctx, tx, cp, cp.Phase, next)
	}, nil)
	if err == nil && stale {
		return false, fmt.Errorf("rating rebuild %s aborted: %w", generation, ratingmath.ErrRatingConfigStale)
	}
	return staged, err
}

func finishRatingStage(ctx context.Context, tx database.Store, cp database.RatingRebuildCheckpoint) error {
	if cp.Phase == "player_renown" {
		return advanceRatingStage(ctx, tx, cp, "guild_renown", ratingStageCursor{})
	}
	return advanceRatingStage(ctx, tx, cp, "players", ratingStageCursor{})
}

// StageRatingEvidenceStep snapshots or resumes a generation and commits at most
// one evidence page. A River worker can snooze between pages rather than hold a
// single job open while scanning an unbounded tenant history.
func StageRatingEvidenceStep(ctx context.Context, store database.Store, tenant uuid.UUID, asOf time.Time) (uuid.UUID, bool, error) {
	policies, err := store.ListTenantRatingPolicies(ctx, tenant)
	if err != nil {
		return uuid.Nil, false, err
	}
	if len(policies) == 0 {
		cp, err := store.GetBuildingRatingRebuildCheckpoint(ctx, tenant)
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, true, nil
		}
		if err != nil {
			return uuid.Nil, false, err
		}
		staged, err := stageRatingEvidencePage(ctx, store, tenant, cp.GenerationID, false)
		return cp.GenerationID, staged, err
	}
	var version int32
	for _, p := range policies {
		if p.Version > version {
			version = p.Version
		}
	}
	generation, err := store.StartRatingRebuild(ctx, database.StartRatingRebuildParams{
		TenantID: tenant, PolicyVersion: version, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	if err != nil {
		return uuid.Nil, false, err
	}
	staged, err := stageRatingEvidencePage(ctx, store, tenant, generation, false)
	return generation, staged, err
}

// StageTenantRatingEvidenceStep only stages bounded tenant-wide evidence. It is
// intentionally not called by River: a tenant generation cannot be projected
// or published until the tenant-only score and scope phases are available.
func StageTenantRatingEvidenceStep(ctx context.Context, store database.Store, tenant uuid.UUID, asOf time.Time) (uuid.UUID, bool, error) {
	generation, err := store.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: tenant, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	if err != nil {
		return uuid.Nil, false, err
	}
	staged, err := stageRatingEvidencePage(ctx, store, tenant, generation, true)
	return generation, staged, err
}

// StageRatingEvidence resumes the existing generation if possible, or freezes
// a new snapshot. It does not publish or project: callers must project all four
// metrics and scope rows before transitioning the checkpoint to ready.
// Historical Renown repair is a separate job run before starting a generation;
// this snapshot never imports evidence written after its source cutoff.
func StageRatingEvidence(ctx context.Context, store database.Store, tenant uuid.UUID, asOf time.Time) (uuid.UUID, error) {
	policies, err := store.ListTenantRatingPolicies(ctx, tenant)
	if err != nil {
		return uuid.Nil, err
	}
	if len(policies) == 0 {
		cp, err := store.GetBuildingRatingRebuildCheckpoint(ctx, tenant)
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, nil
		}
		if err != nil {
			return uuid.Nil, err
		}
		// An existing build must still be examined for a stale configuration.
		_, err = stageRatingEvidencePage(ctx, store, tenant, cp.GenerationID, false)
		return cp.GenerationID, err
	}
	var version int32
	for _, p := range policies {
		if p.Version > version {
			version = p.Version
		}
	}
	// Start checks for an unfinished checkpoint even if the policy was removed.
	generation, err := store.StartRatingRebuild(ctx, database.StartRatingRebuildParams{TenantID: tenant, PolicyVersion: version, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)})
	if err != nil {
		return uuid.Nil, err
	}
	for {
		staged, err := stageRatingEvidencePage(ctx, store, tenant, generation, false)
		if err != nil {
			return generation, err
		}
		if staged {
			return generation, nil
		}
	}
}
