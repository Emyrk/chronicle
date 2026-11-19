package parseresult

import (
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
)

// TrashRankingInput carries clean, non-boss encounters. The primary applies
// minimum duration, rankability and level eligibility, then groups players by
// GUID/spec/sub-spec at write time.
type TrashRankingInput struct {
	Encounters []TrashRankingEncounter `json:"encounters"`
}

type TrashRankingEncounter struct {
	End          time.Time          `json:"end"`
	DurationSecs float64            `json:"duration_secs"`
	Units        []TrashRankingUnit `json:"units"`
}

type TrashRankingUnit struct {
	BossRankingUnit
	DamageDone        int64    `json:"damage_done"`
	AliveDurationSecs *float64 `json:"alive_duration_secs,omitempty"`
}

func projectTrashRankings(fin *instances.FinalizedInstance) TrashRankingInput {
	var out TrashRankingInput
	if fin.Rankings == nil {
		return out
	}
	for _, enc := range fin.Encounters {
		if enc.Boss || enc.KillType != encounter.KillTypeClean {
			continue
		}
		dps := fin.Rankings.DPS[enc.Combat.EncounterID]
		if dps == nil {
			continue
		}
		duration := enc.Combat.End.Sub(enc.Combat.Start).Seconds()
		e := TrashRankingEncounter{End: enc.Combat.End, DurationSecs: duration}
		for id, stats := range dps.Units {
			if stats == nil {
				continue
			}
			u := TrashRankingUnit{BossRankingUnit: BossRankingUnit{
				GUID: id.String(), Player: stats.IsPlayer, DamageTaken: stats.DamageTaken,
				Healing: stats.HealingDone, Absorbed: stats.HealingAbsorbed, ObservedForm: stats.ObservedForm,
			}, DamageDone: stats.DamageDone}
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
					if len(names) > 0 {
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
					alive := tracked.AliveDurationSecs
					u.AliveDurationSecs = &alive
				}
			}
			e.Units = append(e.Units, u)
		}
		slices.SortFunc(e.Units, func(a, b TrashRankingUnit) int {
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
