package chronicle

import (
	"context"
	"fmt"
	"math"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type parsedTrashKey struct{ GUID, Spec, SubSpec string }
type parsedTrashAccum struct {
	Player                           parseresult.TrashRankingUnit
	Damage, Taken, Healing, Absorbed int64
	Deaths                           int32
	AliveSecs, DurationSecs          float64
	TalentLayout                     string
	TalentSummary                    []int16
	LastKilledAt                     time.Time
}

// InsertParsedTrashRankings persists the trash aggregation only. The caller
// owns the supplementary transaction, refresh lock, parse-generation fence,
// ranking-run source/credit updates and any resulting refresh enqueue.
func InsertParsedTrashRankings(ctx context.Context, store database.Store, result parseresult.Result, write ParsedBossRankingWrite) error {
	if result.SchemaVersion != 7 || result.Format != database.LogFormat112aCcAddon {
		return fmt.Errorf("unsupported trash ranking parse result schema %d format %q", result.SchemaVersion, result.Format)
	}
	if !write.Rankable || !result.BossRankings.HasRules || !result.BossRankings.HasDPS || !result.BossRankings.LevelEligible {
		return nil
	}
	if write.Instance.ID == uuid.Nil || write.Instance.RealmID == uuid.Nil || result.Name == "" {
		return fmt.Errorf("trash ranking insert requires instance, realm and name")
	}
	// Reject malformed identifiers and duration before making any writes.
	for _, enc := range result.TrashRankings.Encounters {
		if math.IsNaN(enc.DurationSecs) || math.IsInf(enc.DurationSecs, 0) || enc.DurationSecs < 0 {
			return fmt.Errorf("invalid trash ranking duration")
		}
		for _, u := range enc.Units {
			if _, err := guid.FromString(u.GUID); err != nil {
				return fmt.Errorf("trash ranking unit guid: %w", err)
			}
			if u.OwnerGUID != "" {
				if _, err := guid.FromString(u.OwnerGUID); err != nil {
					return fmt.Errorf("trash ranking owner guid: %w", err)
				}
			}
		}
	}
	accum := make(map[parsedTrashKey]*parsedTrashAccum)
	for _, enc := range result.TrashRankings.Encounters {
		if enc.DurationSecs < MinimumCombatTimeForRankings {
			continue
		}
		ownerDamage, ownerHealing, ownerAbsorb := map[string]int64{}, map[string]int64{}, map[string]int64{}
		for _, u := range enc.Units {
			if !u.Player && u.OwnerGUID != "" {
				ownerDamage[u.OwnerGUID] += u.DamageDone
				ownerHealing[u.OwnerGUID] += u.Healing
				ownerAbsorb[u.OwnerGUID] += u.Absorbed
			}
		}
		for _, u := range enc.Units {
			if !u.Player {
				continue
			}
			var snapshot *combatant.Talents
			if u.Talents != nil {
				snapshot = &combatant.Talents{Summary: u.Talents.Summary}
				for i := range snapshot.Trees {
					snapshot.Trees[i] = u.Talents.Trees[i]
				}
			}
			spec, subSpec, layout, summary := extractTalentInfoFromSnapshot(u.Class, snapshot, u.ObservedForm, write.Flavor, write.TalentTreeData)
			key := parsedTrashKey{GUID: u.GUID, Spec: spec, SubSpec: subSpec}
			a := accum[key]
			if a == nil {
				a = &parsedTrashAccum{Player: u, TalentLayout: layout, TalentSummary: summary}
				accum[key] = a
			}
			a.Damage += u.DamageDone + ownerDamage[u.GUID]
			a.Taken += u.DamageTaken
			a.Healing += u.Healing + ownerHealing[u.GUID]
			a.Absorbed += u.Absorbed + ownerAbsorb[u.GUID]
			if u.Survivability == nil || u.AliveDurationSecs == nil {
				a.AliveSecs += enc.DurationSecs
			} else {
				a.AliveSecs += *u.AliveDurationSecs
				a.Deaths += u.Survivability.Deaths
			}
			a.DurationSecs += enc.DurationSecs
			if enc.End.After(a.LastKilledAt) {
				a.LastKilledAt = enc.End
			}
		}
	}
	metrics := make(map[parsedTrashKey]wowspec.PlayerMetrics, len(accum))
	for key, a := range accum {
		metrics[key] = wowspec.PlayerMetrics{DamageDone: a.Damage, DamageTaken: a.Taken, HealingDone: a.Healing, Class: a.Player.Class, Spec: key.Spec}
	}
	roles := wowspec.InferRoles(metrics)
	keys := make([]parsedTrashKey, 0, len(accum))
	for key := range accum {
		keys = append(keys, key)
	}
	slices.SortFunc(keys, func(a, b parsedTrashKey) int {
		if a.GUID != b.GUID {
			if a.GUID < b.GUID {
				return -1
			}
			return 1
		}
		if a.Spec != b.Spec {
			if a.Spec < b.Spec {
				return -1
			}
			return 1
		}
		if a.SubSpec < b.SubSpec {
			return -1
		}
		if a.SubSpec > b.SubSpec {
			return 1
		}
		return 0
	})
	for _, key := range keys {
		a := accum[key]
		if a.Player.Name == "" || a.DurationSecs < MinimumCombatTimeForRankings {
			continue
		}
		var buildID uuid.NullUUID
		if a.TalentLayout != "" {
			if write.DatasetID == uuid.Nil {
				return fmt.Errorf("trash ranking talent build requires dataset id")
			}
			id, err := store.UpsertTalentBuild(ctx, database.UpsertTalentBuildParams{
				DatasetID: write.DatasetID, PlayerClass: a.Player.Class, TalentSummary: a.TalentSummary,
				TalentLayout: a.TalentLayout, Spec: key.Spec, SubSpec: pgtype.Text{String: key.SubSpec, Valid: key.SubSpec != ""},
			})
			if err != nil {
				return fmt.Errorf("upsert parsed trash talent build for %s: %w", a.Player.Name, err)
			}
			buildID = uuid.NullUUID{UUID: id, Valid: true}
		}
		err := store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			InstanceID: write.Instance.ID, EncounterName: "Trash", InstanceName: result.Name,
			PlayerGuid: key.GUID, PlayerName: a.Player.Name, PlayerClass: a.Player.Class,
			PlayerSpec: key.Spec, PlayerSubSpec: key.SubSpec, PlayerRole: roles[key], PlayerLevel: a.Player.Level,
			TalentBuildID: buildID, DifficultyName: write.Instance.DifficultyName, MaxPlayers: int16(write.Instance.MaxPlayers),
			RealmID: write.Instance.RealmID, RealmName: write.RealmName, GuildName: a.Player.GuildName,
			DamageDone: a.Damage, DurationSecs: a.DurationSecs, Dps: float64(a.Damage) / a.DurationSecs,
			HealingDone: a.Healing, AbsorbedDone: a.Absorbed, Hps: float64(a.Healing+a.Absorbed) / a.DurationSecs,
			AlivePercentage: pgtype.Float8{Float64: a.AliveSecs / a.DurationSecs * 100, Valid: true},
			PlayerDeaths:    pgtype.Int4{Int32: a.Deaths, Valid: true},
			LogHashedSlug:   write.Instance.HashedSlug.String, KilledAt: database.Timestamptz(a.LastKilledAt),
		})
		if err != nil {
			return fmt.Errorf("insert parsed trash ranking for %s (%s): %w", a.Player.Name, key.Spec, err)
		}
	}
	return nil
}
