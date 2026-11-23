package instances

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// Council difficulty is determined by the final member slain, not fight length.
// Require all three deaths in this attempt so truncated logs, resets, and
// ambiguous final timestamps cannot invent an exact cohort.
func assemblyEncounterVariant(enc *encounter.Encounter) string {
	if enc.Combat.Start.IsZero() || !enc.Combat.End.After(enc.Combat.Start) {
		return ""
	}
	deaths := make(map[string]time.Time, 3)
	for id, hostile := range enc.Combat.Hostiles {
		entry, _ := id.GetEntry()
		var variant string
		switch entry {
		case 32857, 33694: // Stormcaller Brundir
			variant = "normal"
		case 32927, 33692: // Runemaster Molgeim
			variant = "medium"
		case 32867, 33693: // Steelbreaker
			variant = "hard"
		default:
			continue
		}
		if _, duplicate := deaths[variant]; duplicate || len(hostile.Activity) == 0 {
			return ""
		}
		last := hostile.Activity[len(hostile.Activity)-1]
		if last.EndState != period.EndStateSlain || last.End == nil {
			return ""
		}
		slain, ok := last.End.Timestamp.(*messages.Slain)
		if !ok || slain.Victim != id || slain.Date().Before(enc.Combat.Start) || slain.Date().After(enc.Combat.End) {
			return ""
		}
		deaths[variant] = slain.Date()
	}
	if len(deaths) != 3 {
		return ""
	}
	for variant, death := range deaths {
		last := true
		for other, at := range deaths {
			if other != variant && !death.After(at) {
				last = false
				break
			}
		}
		if last {
			return variant
		}
	}
	return ""
}
