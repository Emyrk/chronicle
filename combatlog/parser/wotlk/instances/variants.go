package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/database"
	"time"
)

// Only Hodir has a supported detector. Trust the successful parsed encounter
// duration, including its inferred start, as the ranking policy requires. This
// does not alter difficulty, ranking windows, or speedrun eligibility/timing.
func ulduarEncounterVariant(enc encounter.Encounter, flavor database.WoWFlavor) string {
	if !flavor.Has(database.FlavorWrath) || !enc.Boss || enc.Name != "Hodir" || enc.Combat.MapID != 603 {
		return ""
	}
	if enc.KillType != encounter.KillTypeClean && enc.KillType != encounter.KillTypePartial {
		return ""
	}
	duration := enc.Combat.End.Sub(enc.Combat.Start)
	if enc.Combat.Start.IsZero() || enc.Combat.End.IsZero() || duration <= 0 {
		return ""
	}
	if duration < 180*time.Second {
		return "hard"
	}
	return "normal"
}
