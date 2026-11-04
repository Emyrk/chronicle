package ratingmath

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const tenantRenownRefreshPageSize int32 = 25

// RefreshDirtyTenantRenown applies one bounded page of fact changes to the
// active projection. It does not consume keys while a full rebuild is building:
// publishing that older snapshot would otherwise erase our incremental writes.
// The tenant revision lock serializes this check with rebuild start/publish.
func RefreshDirtyTenantRenown(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.LockTenantRatingRevision(ctx, tenant); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil // A first generation has not been started yet.
			}
			return err
		}
		building, err := tx.TenantRatingGenerationBuilding(ctx, tenant)
		if err != nil {
			return err
		}
		if building {
			return nil
		}
		generation, err := tx.LockActiveTenantRatingGeneration(ctx, tenant)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // Initial rebuild has not published yet. Keep the durable keys.
		}
		if err != nil {
			return err
		}
		checkpoint, err := tx.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{
			TenantID: tenant, GenerationID: generation,
		})
		if err != nil {
			return err
		}
		var manifest struct {
			Writer       string              `json:"writer"`
			RulesVersion int32               `json:"rules_version"`
			Policy       *TenantRatingPolicy `json:"tenant_policy"`
			Bosses       []struct {
				Realm     uuid.UUID `json:"realm_id"`
				Instance  string    `json:"instance_name"`
				Encounter string    `json:"encounter_name"`
				Points    float64   `json:"renown_points"`
			} `json:"renown_bosses"`
		}
		if err := json.Unmarshal(checkpoint.Manifest, &manifest); err != nil {
			return fmt.Errorf("invalid active Renown manifest: %w", err)
		}
		if manifest.Writer != "tenant" || manifest.RulesVersion != 3 || manifest.Policy == nil ||
			manifest.Policy.TenantID != tenant || manifest.Policy.PeriodDays != 180 {
			return errors.New("active Renown projection is not fixed-rules tenant ratings")
		}
		keys, err := tx.LockDirtyRenownSubjects(ctx, database.LockDirtyRenownSubjectsParams{
			TenantID: tenant, BatchSize: tenantRenownRefreshPageSize,
		})
		if err != nil {
			return err
		}
		periodStart := now.AddDate(0, 0, -int(manifest.Policy.PeriodDays))
		for _, key := range keys {
			var award float64
			var configured bool
			for _, boss := range manifest.Bosses {
				if boss.Realm == key.RealmID && boss.Instance == key.InstanceName && boss.Encounter == key.EncounterName {
					configured = true
					award, err = RenownAward(boss.Points)
					if err != nil {
						return err
					}
					break
				}
			}
			if err := refreshTenantRenownSubject(ctx, tx, generation, key, award, configured, now, periodStart); err != nil {
				return err
			}
			n, err := tx.DeleteDirtyRenownSubjectIfRevision(ctx, database.DeleteDirtyRenownSubjectIfRevisionParams{
				TenantID: tenant, SubjectKind: key.SubjectKind, RealmID: key.RealmID,
				SubjectID: key.SubjectID, InstanceName: key.InstanceName,
				EncounterName: key.EncounterName, Revision: key.Revision,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return errors.New("renown dirty subject changed during refresh")
			}
			processed++
		}
		return nil
	}, nil)
	if err != nil {
		return 0, err
	}
	return processed, nil
}

func refreshTenantRenownSubject(ctx context.Context, tx database.Store, generation uuid.UUID,
	key database.LockDirtyRenownSubjectsRow, award float64, configured bool, now, periodStart time.Time) error {
	var career, period int32
	guild := uuid.Nil
	switch key.SubjectKind {
	case "player":
		counts, err := tx.CountPlayerRenownFactsForSubject(ctx, database.CountPlayerRenownFactsForSubjectParams{
			RealmID: key.RealmID, PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
			EncounterName: key.EncounterName, PeriodStart: database.Timestamptz(periodStart),
			AsOf: database.Timestamptz(now),
		})
		if err != nil {
			return err
		}
		career, period = counts.CareerKills, counts.PeriodKills
	case "guild":
		var err error
		guild, err = uuid.Parse(key.SubjectID)
		if err != nil {
			return err
		}
		counts, err := tx.CountGuildRenownFactsForSubject(ctx, database.CountGuildRenownFactsForSubjectParams{
			TenantID: key.TenantID, RealmID: key.RealmID, GuildID: guild,
			InstanceName: key.InstanceName, EncounterName: key.EncounterName,
			PeriodStart: database.Timestamptz(periodStart), AsOf: database.Timestamptz(now),
		})
		if err != nil {
			return err
		}
		career, period = counts.CareerKills, counts.PeriodKills
	default:
		return fmt.Errorf("invalid Renown subject kind %q", key.SubjectKind)
	}
	for _, window := range []struct {
		kind  string
		kills int32
	}{{"career", career}, {"period", period}} {
		var start, end pgtype.Timestamptz
		if window.kind == "period" {
			start, end = database.Timestamptz(periodStart), database.Timestamptz(now)
		}
		if key.SubjectKind == "player" {
			if window.kills == 0 || !configured {
				if err := tx.DeletePlayerTenantRenownBoss(ctx, database.DeletePlayerTenantRenownBossParams{
					GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
					PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
					EncounterName: key.EncounterName, WindowKind: window.kind,
				}); err != nil {
					return err
				}
			} else {
				n, err := tx.UpsertPlayerTenantRenownBoss(ctx, database.UpsertPlayerTenantRenownBossParams{
					GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
					PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
					EncounterName: key.EncounterName, WindowKind: window.kind,
					WindowStart: start, WindowEnd: end, Score: float64(window.kills) * award,
					EligibleKills: window.kills,
				})
				if err != nil {
					return err
				}
				if n != 1 {
					return errors.New("active player Renown row rejected")
				}
			}
			if err := tx.DeletePlayerTenantRenownScope(ctx, database.DeletePlayerTenantRenownScopeParams{
				GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
				PlayerGuid: key.SubjectID, InstanceName: key.InstanceName, WindowKind: window.kind,
			}); err != nil {
				return err
			}
			if err := tx.InsertPlayerTenantRenownScopes(ctx, database.InsertPlayerTenantRenownScopesParams{
				GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
				PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
				WindowKind: window.kind, WindowStart: start, WindowEnd: end,
			}); err != nil {
				return err
			}
			continue
		}
		if window.kills == 0 || !configured {
			if err := tx.DeleteGuildTenantRenownBoss(ctx, database.DeleteGuildTenantRenownBossParams{
				GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
				GuildID: guild, InstanceName: key.InstanceName,
				EncounterName: key.EncounterName, WindowKind: window.kind,
			}); err != nil {
				return err
			}
		} else {
			n, err := tx.UpsertGuildTenantRenownBoss(ctx, database.UpsertGuildTenantRenownBossParams{
				GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
				GuildID: guild, InstanceName: key.InstanceName,
				EncounterName: key.EncounterName, WindowKind: window.kind,
				WindowStart: start, WindowEnd: end, Score: float64(window.kills) * award,
				EligibleKills: window.kills,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return errors.New("active guild Renown row rejected")
			}
		}
		if err := tx.DeleteGuildTenantRenownScope(ctx, database.DeleteGuildTenantRenownScopeParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guild, InstanceName: key.InstanceName, WindowKind: window.kind,
		}); err != nil {
			return err
		}
		if err := tx.InsertGuildTenantRenownScopes(ctx, database.InsertGuildTenantRenownScopesParams{
			GenerationID: generation, TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guild, InstanceName: key.InstanceName,
			WindowKind: window.kind, WindowStart: start, WindowEnd: end,
		}); err != nil {
			return err
		}
	}
	return nil
}
