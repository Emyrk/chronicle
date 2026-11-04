package ratingmath

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// RefreshEvolvingTenantRenown applies one bounded dirty page to generation-free tenant scores.
func RefreshEvolvingTenantRenown(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		allowed, err := shouldRefreshEvolvingTenantRating(ctx, tx, tenant)
		if err != nil || !allowed {
			return err
		}
		manifest, err := currentEvolvingTenantRatingPolicy(ctx, tx, tenant)
		if err != nil {
			return err
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
			if err := evolvingRefreshTenantRenownSubject(ctx, tx, key, award, configured, now, periodStart); err != nil {
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

func evolvingRefreshTenantRenownSubject(ctx context.Context, tx database.Store,
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
				if err := tx.EvolvingDeletePlayerTenantRenownBoss(ctx, database.EvolvingDeletePlayerTenantRenownBossParams{
					TenantID: key.TenantID, RealmID: key.RealmID,
					PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
					EncounterName: key.EncounterName, WindowKind: window.kind,
				}); err != nil {
					return err
				}
			} else {
				n, err := tx.EvolvingUpsertPlayerTenantRenownBoss(ctx, database.EvolvingUpsertPlayerTenantRenownBossParams{
					TenantID: key.TenantID, RealmID: key.RealmID,
					PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
					EncounterName: key.EncounterName, WindowKind: window.kind,
					WindowStart: start, WindowEnd: end, Score: float64(window.kills) * award,
					EligibleKills: window.kills,
				})
				if err != nil {
					return err
				}
				if n != 1 {
					return errors.New("evolving player Renown row rejected")
				}
			}
			if err := tx.EvolvingDeletePlayerTenantRenownScope(ctx, database.EvolvingDeletePlayerTenantRenownScopeParams{
				TenantID: key.TenantID, RealmID: key.RealmID,
				PlayerGuid: key.SubjectID, InstanceName: key.InstanceName, WindowKind: window.kind,
			}); err != nil {
				return err
			}
			if err := tx.EvolvingInsertPlayerTenantRenownScopes(ctx, database.EvolvingInsertPlayerTenantRenownScopesParams{
				TenantID: key.TenantID, RealmID: key.RealmID,
				PlayerGuid: key.SubjectID, InstanceName: key.InstanceName,
				WindowKind: window.kind, WindowStart: start, WindowEnd: end,
			}); err != nil {
				return err
			}
			continue
		}
		if window.kills == 0 || !configured {
			if err := tx.EvolvingDeleteGuildTenantRenownBoss(ctx, database.EvolvingDeleteGuildTenantRenownBossParams{
				TenantID: key.TenantID, RealmID: key.RealmID,
				GuildID: guild, InstanceName: key.InstanceName,
				EncounterName: key.EncounterName, WindowKind: window.kind,
			}); err != nil {
				return err
			}
		} else {
			n, err := tx.EvolvingUpsertGuildTenantRenownBoss(ctx, database.EvolvingUpsertGuildTenantRenownBossParams{
				TenantID: key.TenantID, RealmID: key.RealmID,
				GuildID: guild, InstanceName: key.InstanceName,
				EncounterName: key.EncounterName, WindowKind: window.kind,
				WindowStart: start, WindowEnd: end, Score: float64(window.kills) * award,
				EligibleKills: window.kills,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return errors.New("evolving guild Renown row rejected")
			}
		}
		if err := tx.EvolvingDeleteGuildTenantRenownScope(ctx, database.EvolvingDeleteGuildTenantRenownScopeParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guild, InstanceName: key.InstanceName, WindowKind: window.kind,
		}); err != nil {
			return err
		}
		if err := tx.EvolvingInsertGuildTenantRenownScopes(ctx, database.EvolvingInsertGuildTenantRenownScopesParams{
			TenantID: key.TenantID, RealmID: key.RealmID,
			GuildID: guild, InstanceName: key.InstanceName,
			WindowKind: window.kind, WindowStart: start, WindowEnd: end,
		}); err != nil {
			return err
		}
	}
	return nil
}
