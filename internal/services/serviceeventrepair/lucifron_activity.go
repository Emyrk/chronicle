package serviceeventrepair

import (
	"math"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

const lucifronActivitySkipReason = "Skipped: encounter activity lists only Lucifron and his protectors"

// This is an approved conservative optimization, not proof of correct damage.
// Only explicit, unambiguous activity for every ranked Lucifron kill qualifies.
// Missing or additional metadata falls through to normal event reconstruction.
func lucifronActivityOnlyTargets(e razorgoreEvidence) bool {
	encounters := map[uuid.UUID]database.LogInstanceEncounter{}
	for _, c := range e.Encounters {
		if c.Name != "Lucifron" {
			continue
		}
		if _, duplicate := encounters[c.ID]; duplicate {
			return false
		}
		encounters[c.ID] = c
	}
	ranked := map[uuid.UUID]map[guid.GUID]bool{}
	for _, row := range e.Rankings {
		c, relevant := encounters[row.EncounterID.UUID]
		if !relevant {
			if row.EncounterName == "Lucifron" {
				return false
			}
			continue
		}
		if !row.EncounterID.Valid || row.InstanceID != e.Instance.ID || row.EncounterName != "Lucifron" || row.InstanceName != "Molten Core" {
			return false
		}
		player, err := guid.FromString(row.PlayerGuid)
		if err != nil || !player.IsPlayer() || player.IsZero() {
			return false
		}
		if ranked[c.ID] == nil {
			ranked[c.ID] = map[guid.GUID]bool{}
		}
		if ranked[c.ID][player] {
			return false
		}
		ranked[c.ID][player] = true
		if row.DamageDone < 0 || row.UnrankedDamageDone < 0 || row.DamageDone > math.MaxInt64-row.UnrankedDamageDone || math.IsNaN(row.Dps) || math.IsInf(row.Dps, 0) || row.DurationSecs <= 0 || row.DurationSecs != c.EndTime.Time.Sub(c.StartTime.Time).Seconds() {
			return false
		}
	}
	if len(ranked) == 0 {
		return false
	}
	for id, c := range encounters {
		if len(ranked[id]) == 0 {
			if c.KillType == database.KillTypeClean {
				return false
			} // Preserve missing-source guards.
			continue
		}
		if c.InstanceID != e.Instance.ID || !c.Boss || c.InvalidatedAt.Valid || c.KillType != database.KillTypeClean || !c.StartTime.Valid || !c.EndTime.Valid || !c.EndTime.Time.After(c.StartTime.Time) {
			return false
		}
		duration := c.EndTime.Time.Sub(c.StartTime.Time)
		if duration != time.Duration(duration.Milliseconds())*time.Millisecond || c.StartTime.Time.Nanosecond()%int(time.Millisecond) != 0 {
			return false
		}
		if c.RankingStartOffsetMs.Valid && c.RankingStartOffsetMs.Int64 != 0 || c.RankingEndOffsetMs.Valid && c.RankingEndOffsetMs.Int64 != duration.Milliseconds() {
			return false
		}
		units := map[guid.GUID]bool{}
		bosses, protectors := 0, 0
		for _, hostile := range e.Hostiles {
			if hostile.EncounterID != id {
				continue
			}
			if !hostile.ID.IsCreature() || units[hostile.ID] || len(hostile.Periods) == 0 {
				return false
			}
			units[hostile.ID] = true
			entry, ok := hostile.ID.GetEntry()
			if !ok {
				return false
			}
			switch entry {
			case 12118:
				bosses++
			case 12119:
				protectors++
			default:
				return false
			}
			var previousEnd time.Time
			for _, period := range hostile.Periods {
				if period.Start == nil || period.End == nil {
					return false
				}
				start, end := period.Start.Timestamp, period.End.Timestamp
				if start.Before(c.StartTime.Time) || end.After(c.EndTime.Time) || !end.After(start) || start.Before(previousEnd) {
					return false
				}
				if period.LastActive != nil && (period.LastActive.Timestamp.Before(start) || period.LastActive.Timestamp.After(end)) {
					return false
				}
				previousEnd = end
			}
		}
		if len(units) != 3 || bosses != 1 || protectors != 2 {
			return false
		}
	}
	return true
}
