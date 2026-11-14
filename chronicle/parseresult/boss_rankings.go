package parseresult

import (
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
)

// BossRankingInput is a bounded snapshot of the legacy boss DPS writer's
// inputs. Trash aggregation, guild credit, and ranking-run refresh are not here.
type BossRankingInput struct {
	HasRules      bool                   `json:"has_rules"`
	HasDPS        bool                   `json:"has_dps"`
	LevelEligible bool                   `json:"level_eligible"`
	Encounters    []BossRankingEncounter `json:"encounters"`
}

type BossRankingEncounter struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	End          time.Time         `json:"end"`
	DurationSecs float64           `json:"duration_secs"`
	Units        []BossRankingUnit `json:"units"`
}

type BossRankingUnit struct {
	GUID           string                `json:"guid"`
	OwnerGUID      string                `json:"owner_guid,omitempty"`
	Player         bool                  `json:"player"`
	Name           string                `json:"name,omitempty"`
	Class          string                `json:"class,omitempty"`
	GuildName      string                `json:"guild_name,omitempty"`
	Level          int16                 `json:"level,omitempty"`
	Talents        *RankingTalents       `json:"talents,omitempty"`
	ObservedForm   string                `json:"observed_form,omitempty"`
	RankedDamage   int64                 `json:"ranked_damage"`
	UnrankedDamage int64                 `json:"unranked_damage"`
	DamageTaken    int64                 `json:"damage_taken"`
	Healing        int64                 `json:"healing"`
	Absorbed       int64                 `json:"absorbed"`
	Survivability  *RankingSurvivability `json:"survivability,omitempty"`
}

type RankingTalents struct {
	Summary [3]uint8   `json:"summary"`
	Trees   [3][]uint8 `json:"trees"`
}

type RankingSurvivability struct {
	Deaths          int32   `json:"deaths"`
	AlivePercentage float64 `json:"alive_percentage"`
}

func projectBossRankings(fin *instances.FinalizedInstance) BossRankingInput {
	out := BossRankingInput{HasRules: fin.RankingRules != nil, LevelEligible: true}
	if fin.Rankings == nil {
		return out
	}
	out.HasDPS = fin.Rankings.DPS != nil
	if fin.Rankings.Speedrun != nil && fin.Rankings.Speedrun.LevelRange != nil {
		out.LevelEligible = fin.Rankings.Speedrun.LevelRange.Satisfied
	}
	for _, enc := range fin.Encounters {
		if !enc.Boss || (enc.KillType != encounter.KillTypeClean && enc.KillType != encounter.KillTypePartial) {
			continue
		}
		dps := fin.Rankings.DPS[enc.Combat.EncounterID]
		if dps == nil {
			continue
		}
		duration := enc.Combat.End.Sub(enc.Combat.Start).Seconds()
		if enc.RankingWindow != nil {
			duration = enc.RankingWindow.End.Sub(enc.RankingWindow.Start).Seconds()
		}
		e := BossRankingEncounter{ID: enc.Combat.EncounterID.String(), Name: enc.Name, End: enc.Combat.End, DurationSecs: duration}
		for id, stats := range dps.Units {
			if stats == nil {
				continue
			}
			u := BossRankingUnit{GUID: id.String(), Player: stats.IsPlayer, RankedDamage: stats.RankedDamageDone,
				UnrankedDamage: stats.UnrankedDamageDone, DamageTaken: stats.DamageTaken, Healing: stats.HealingDone,
				Absorbed: stats.HealingAbsorbed, ObservedForm: stats.ObservedForm}
			if stats.OwnerGUID != nil {
				u.OwnerGUID = stats.OwnerGUID.String()
			}
			if stats.IsPlayer && fin.Guilds != nil {
				if player, ok := fin.Guilds.Players[id]; ok {
					u.Name, u.Class = player.Name, string(db2sdk.HeroClassToDB(player.HeroClass))
					if player.Level != nil {
						u.Level = int16(*player.Level)
					}
					names := make([]string, 0, len(fin.Guilds.Guilds))
					for name, members := range fin.Guilds.Guilds {
						if _, ok := members[id]; ok {
							names = append(names, name)
						}
					}
					slices.Sort(names)
					if len(names) != 0 {
						u.GuildName = names[0]
					}
				}
			}
			if stats.Talents != nil {
				u.Talents = copyRankingTalents(stats.Talents)
			}
			if survival := fin.Rankings.Survivability[enc.Combat.EncounterID]; survival != nil {
				if tracked, ok := survival.Players[id]; ok {
					u.Survivability = &RankingSurvivability{Deaths: tracked.Deaths, AlivePercentage: tracked.AlivePercentage}
				}
			}
			e.Units = append(e.Units, u)
		}
		slices.SortFunc(e.Units, func(a, b BossRankingUnit) int {
			if a.GUID < b.GUID {
				return -1
			}
			if a.GUID > b.GUID {
				return 1
			}
			return 0
		})
		out.Encounters = append(out.Encounters, e)
	}
	return out
}

func copyRankingTalents(t *combatant.Talents) *RankingTalents {
	out := &RankingTalents{Summary: t.Summary}
	for i := range t.Trees {
		out.Trees[i] = slices.Clone(t.Trees[i])
	}
	return out
}
