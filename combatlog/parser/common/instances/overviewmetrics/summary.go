package overviewmetrics

import (
	"sort"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	overviewmetricsversion "github.com/Emyrk/chronicle/internal/overviewmetrics"
)

type Summary struct {
	RequirementsComplete       *bool
	PlayerDeaths               int32
	WipeCount                  int32
	TopIncomingDamageAbilities []DeadliestAbility
	EncounterSpanDuration      time.Duration
	TotalCombatDuration        time.Duration
	TotalBossDuration          time.Duration
	MetricsVersion             int32
}

type combatInterval struct {
	start time.Time
	end   time.Time
}

func Summarize(encounters []encounter.Encounter, abilities []DeadliestAbility, speedrun *rankings.SpeedrunResult) Summary {
	allIntervals := make([]combatInterval, 0, len(encounters))
	bossIntervals := make([]combatInterval, 0, len(encounters))
	var firstStart, lastEnd time.Time
	var playerDeaths, wipeCount int32

	for _, enc := range encounters {
		if enc.Combat.End.Before(enc.Combat.Start) {
			continue
		}
		interval := combatInterval{start: enc.Combat.Start, end: enc.Combat.End}
		allIntervals = append(allIntervals, interval)
		if firstStart.IsZero() || interval.start.Before(firstStart) {
			firstStart = interval.start
		}
		if lastEnd.IsZero() || interval.end.After(lastEnd) {
			lastEnd = interval.end
		}
		playerDeaths += int32(len(enc.Combat.PlayerDeaths))
		if enc.Boss {
			bossIntervals = append(bossIntervals, interval)
			if enc.KillType == encounter.KillTypeWipe || enc.KillType == encounter.KillTypeReset {
				wipeCount++
			}
		}
	}

	var totalDuration time.Duration
	if !firstStart.IsZero() && !lastEnd.IsZero() {
		totalDuration = lastEnd.Sub(firstStart)
	}

	return Summary{
		RequirementsComplete:       requirementsCompletionStatus(speedrun),
		PlayerDeaths:               playerDeaths,
		WipeCount:                  wipeCount,
		TopIncomingDamageAbilities: abilities,
		EncounterSpanDuration:      totalDuration,
		TotalCombatDuration:        unionDuration(allIntervals),
		TotalBossDuration:          unionDuration(bossIntervals),
		MetricsVersion:             overviewmetricsversion.CurrentVersion,
	}
}

func requirementsCompletionStatus(speedrun *rankings.SpeedrunResult) *bool {
	if speedrun == nil || len(speedrun.Proof) == 0 {
		return nil
	}
	complete := true
	for _, proof := range speedrun.Proof {
		if !proof.Satisfied {
			complete = false
			break
		}
	}
	return &complete
}

func unionDuration(intervals []combatInterval) time.Duration {
	if len(intervals) == 0 {
		return 0
	}
	sort.Slice(intervals, func(i, j int) bool {
		if intervals[i].start.Equal(intervals[j].start) {
			return intervals[i].end.Before(intervals[j].end)
		}
		return intervals[i].start.Before(intervals[j].start)
	})

	start, end := intervals[0].start, intervals[0].end
	var total time.Duration
	for _, interval := range intervals[1:] {
		if !interval.start.After(end) {
			if interval.end.After(end) {
				end = interval.end
			}
			continue
		}
		total += end.Sub(start)
		start, end = interval.start, interval.end
	}
	return total + end.Sub(start)
}
