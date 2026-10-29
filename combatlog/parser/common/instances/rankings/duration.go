package rankings

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

// RankingWindow returns a shortened DPS interval only when every participating
// selected unit has one complete activity period ending in death. A reset,
// surviving add, or ambiguous boundary keeps the entire encounter ranked.
func RankingWindow(fight encounter.Fight, rule DamageTargets, isBoss func(guid.GUID) bool) *encounter.RankingWindow {
	if rule.Mode != DamageTargetsBossOnly && rule.Mode != DamageTargetsEntries {
		return nil
	}
	var start, end time.Time
	selected := false
	for id, hostile := range fight.Hostiles {
		matches := false
		switch rule.Mode {
		case DamageTargetsBossOnly:
			matches = isBoss(id)
		case DamageTargetsEntries:
			entry, ok := id.GetEntry()
			if ok {
				for _, allowed := range rule.EntryIDs {
					if entry == allowed {
						matches = true
						break
					}
				}
			}
		}
		if !matches {
			continue
		}
		selected = true
		if len(hostile.Activity) != 1 {
			return nil
		}
		activity := hostile.Activity[0]
		if activity.Start == nil || activity.End == nil || activity.EndState != period.EndStateSlain {
			return nil
		}
		unitStart := activity.Start.Timestamp.Date()
		unitEnd := activity.End.Timestamp.Date()
		if !unitEnd.After(unitStart) || unitStart.Before(fight.Start) || unitEnd.After(fight.End) {
			return nil
		}
		if start.IsZero() || unitStart.Before(start) {
			start = unitStart
		}
		if end.IsZero() || unitEnd.After(end) {
			end = unitEnd
		}
	}
	if !selected || !end.After(start) || (start.Equal(fight.Start) && end.Equal(fight.End)) {
		return nil
	}
	return &encounter.RankingWindow{Start: start, End: end}
}
