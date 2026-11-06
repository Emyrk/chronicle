package chronicle

import (
	"context"
	"fmt"
	"math"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ParsedBossRankingWrite supplies primary-owned identity and game-data inputs.
// Caller owns a supplementary transaction, parse-generation fence, and any
// ranking-run lock, source touch, guild credit, or refresh side effects.
type ParsedBossRankingWrite struct {
	Instance       database.LogInstance
	RealmName      string
	DatasetID      uuid.UUID
	Flavor         database.WoWFlavor
	TalentTreeData *talents.TalentTreeData
	Rankable       bool
}

// InsertParsedBossRankings writes only boss DPS rows, not aggregated trash.
func InsertParsedBossRankings(ctx context.Context, store database.Store, result parseresult.Result, write ParsedBossRankingWrite) error {
	if result.SchemaVersion != 8 || result.Format != database.LogFormat112aCcAddon {
		return fmt.Errorf("unsupported boss ranking parse result schema %d format %q", result.SchemaVersion, result.Format)
	}
	data := result.BossRankings
	if !write.Rankable || !data.HasRules || !data.HasDPS || !data.LevelEligible {
		return nil
	}
	if write.Instance.ID == uuid.Nil || write.Instance.RealmID == uuid.Nil || result.Name == "" {
		return fmt.Errorf("boss ranking insert requires instance, realm, and name")
	}
	for _, enc := range data.Encounters {
		if _, err := uuid.Parse(enc.ID); err != nil {
			return fmt.Errorf("boss ranking encounter id: %w", err)
		}
		if enc.DurationSecs <= 0 || math.IsNaN(enc.DurationSecs) || math.IsInf(enc.DurationSecs, 0) {
			return fmt.Errorf("boss ranking encounter %s has invalid duration", enc.ID)
		}
		for _, u := range enc.Units {
			if _, err := guid.FromString(u.GUID); err != nil {
				return fmt.Errorf("boss ranking unit guid: %w", err)
			}
			if u.OwnerGUID != "" {
				if _, err := guid.FromString(u.OwnerGUID); err != nil {
					return fmt.Errorf("boss ranking owner guid: %w", err)
				}
			}
		}
	}
	for _, enc := range data.Encounters {
		encID, _ := uuid.Parse(enc.ID)
		ownerDamage, ownerUnranked, ownerHealing, ownerAbsorb := map[string]int64{}, map[string]int64{}, map[string]int64{}, map[string]int64{}
		for _, u := range enc.Units {
			if u.OwnerGUID == "" || u.Player {
				continue
			}
			ownerDamage[u.OwnerGUID] += u.RankedDamage
			ownerUnranked[u.OwnerGUID] += u.UnrankedDamage
			ownerHealing[u.OwnerGUID] += u.Healing
			ownerAbsorb[u.OwnerGUID] += u.Absorbed
		}
		metrics := map[string]wowspec.PlayerMetrics{}
		for _, u := range enc.Units {
			if !u.Player {
				continue
			}
			spec := ""
			if u.Talents != nil && u.Class != "" {
				spec = wowspec.InferSpec(u.Class, u.Talents.Summary)
			}
			metrics[u.GUID] = wowspec.PlayerMetrics{DamageDone: u.RankedDamage + ownerDamage[u.GUID], DamageTaken: u.DamageTaken,
				HealingDone: u.Healing + ownerHealing[u.GUID] + u.Absorbed + ownerAbsorb[u.GUID], Class: u.Class, Spec: spec}
		}
		roles := wowspec.InferRoles(metrics)
		for _, u := range enc.Units {
			if !u.Player || u.Name == "" {
				continue
			}
			var talentsSnapshot *combatant.Talents
			if u.Talents != nil {
				talentsSnapshot = &combatant.Talents{Summary: u.Talents.Summary}
				for i := range talentsSnapshot.Trees {
					talentsSnapshot.Trees[i] = u.Talents.Trees[i]
				}
			}
			spec, subSpec, layout, summary := extractTalentInfoFromSnapshot(u.Class, talentsSnapshot, u.ObservedForm, write.Flavor, write.TalentTreeData)
			var buildID uuid.NullUUID
			if layout != "" {
				if write.DatasetID == uuid.Nil {
					return fmt.Errorf("boss ranking talent build requires dataset id")
				}
				id, err := store.UpsertTalentBuild(ctx, database.UpsertTalentBuildParams{
					DatasetID: write.DatasetID, PlayerClass: u.Class, TalentSummary: summary, TalentLayout: layout, Spec: spec,
					SubSpec: pgtype.Text{String: subSpec, Valid: subSpec != ""},
				})
				if err != nil {
					return fmt.Errorf("upsert parsed boss talent build for %s: %w", u.Name, err)
				}
				buildID = uuid.NullUUID{UUID: id, Valid: true}
			}
			damage, healing, absorbed := u.RankedDamage+ownerDamage[u.GUID], u.Healing+ownerHealing[u.GUID], u.Absorbed+ownerAbsorb[u.GUID]
			alive, deaths := 100.0, int32(0)
			if u.Survivability != nil {
				alive, deaths = u.Survivability.AlivePercentage, u.Survivability.Deaths
			}
			err := store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
				EncounterID: uuid.NullUUID{UUID: encID, Valid: true}, InstanceID: write.Instance.ID,
				EncounterName: enc.Name, InstanceName: result.Name, PlayerGuid: u.GUID, PlayerName: u.Name,
				PlayerClass: u.Class, PlayerSpec: spec, PlayerSubSpec: subSpec, PlayerRole: roles[u.GUID], PlayerLevel: u.Level,
				TalentBuildID: buildID, DifficultyName: write.Instance.DifficultyName, MaxPlayers: int16(write.Instance.MaxPlayers),
				RealmID: write.Instance.RealmID, RealmName: write.RealmName, GuildName: u.GuildName,
				DamageDone: damage, UnrankedDamageDone: u.UnrankedDamage + ownerUnranked[u.GUID],
				DurationSecs: enc.DurationSecs, Dps: float64(damage) / enc.DurationSecs,
				HealingDone: healing, AbsorbedDone: absorbed, Hps: float64(healing+absorbed) / enc.DurationSecs,
				AlivePercentage: pgtype.Float8{Float64: alive, Valid: true}, PlayerDeaths: pgtype.Int4{Int32: deaths, Valid: true},
				LogHashedSlug: write.Instance.HashedSlug.String, KilledAt: database.Timestamptz(enc.End),
			})
			if err != nil {
				return fmt.Errorf("insert parsed boss ranking for %s on %s: %w", u.Name, enc.Name, err)
			}
		}
	}
	return nil
}
