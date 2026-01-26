package instances

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/combatmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

type OngoingFight struct {
	ActiveHostiles map[guid.GUID]struct{}
	damage         []*chronicleproto.Damage

	Start *period.Moment
	End   *period.Moment
}

// Encounter represents a named combat period in the logs.
type Encounter struct {
	// Name is the identifier for this encounter.
	Name string
	Type types.EncounterType

	// Period identifies the start/end of combat
	Combat Fight
	// If it is not a kill, it is a wipe (or reset)
	IsKill    bool
	Remaining []guid.GUID
	Boss      bool

	Damage *combatmetrics.DamageSummary
}

func (e Encounter) NamedString(db *unitdb.Units) string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("%s Fight [Kill=%t]: against %d units\n", e.Type, e.IsKill, len(e.Combat.Hostiles)))
	str.WriteString(fmt.Sprintf("  Start: %s\n", e.Combat.Start.Format("15:04:05.000")))
	str.WriteString(fmt.Sprintf("  End:   %s\n", e.Combat.End.Format("15:04:05.000")))
	str.WriteString("  Hostiles:\n")
	for charID, charFight := range e.Combat.Hostiles {
		unit, ok := db.Get(charID)
		unitName := "Unknown"
		if !ok {
			unitName = unit.Name
		}
		str.WriteString(fmt.Sprintf("    - %s (ID: %s) with %d activity periods\n", unitName, charID.String(), len(charFight.Activity)))
		for _, activity := range charFight.Activity {
			str.WriteString(fmt.Sprintf("        * From %s to %s\n",
				activity.Start.Timestamp.Date().Format("15:04:05.000"),
				activity.End.Timestamp.Date().Format("15:04:05.000"),
			))
		}
	}
	return str.String()
}

// Fight represents a single combat encounter with one or more hostile creatures.
// A fight starts when the first hostile becomes active and ends when the last
// hostile becomes inactive. Hostiles with overlapping activity periods are
// grouped into the same fight.
type Fight struct {
	// Hostiles contains all hostile characters that participated in this fight.
	// Each CharacterFight contains all activity periods from that character
	// that belong to this fight.
	Hostiles map[guid.GUID]CharacterFight
	damage   []*chronicleproto.Damage

	// Start is the earliest start time across all hostile activity periods.
	Start time.Time

	// End is the latest end time across all hostile activity periods.
	End time.Time
}

func (f Fight) Remaining() []guid.GUID {
	remaining := make([]guid.GUID, 0)
	for _, h := range f.Hostiles {
		if !h.Activity[len(h.Activity)-1].Slain {
			remaining = append(remaining, h.ID)
		}
	}
	return remaining
}

func (f Fight) NamedString(db *unitdb.Units) string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("Fight: against %d units\n", len(f.Hostiles)))
	str.WriteString(fmt.Sprintf("  Start: %s\n", f.Start.Format("15:04:05.000")))
	str.WriteString(fmt.Sprintf("  End:   %s\n", f.End.Format("15:04:05.000")))
	str.WriteString("  Hostiles:\n")
	for charID, charFight := range f.Hostiles {
		unit, ok := db.Get(charID)
		unitName := "Unknown"
		if !ok {
			unitName = unit.Name
		}
		str.WriteString(fmt.Sprintf("    - %s (ID: %s) with %d activity periods\n", unitName, charID.String(), len(charFight.Activity)))
		for _, activity := range charFight.Activity {
			str.WriteString(fmt.Sprintf("        * From %s to %s\n",
				activity.Start.Timestamp.Date().Format("15:04:05.000"),
				activity.End.Timestamp.Date().Format("15:04:05.000"),
			))
		}
	}
	return str.String()
}

// CharacterFight represents all activity periods from a single character
// that belong to the same fight.
type CharacterFight struct {
	ID       guid.GUID // TODO: This ID is redundant since it's also the map key in Fight.Hostiles
	Activity []period.Period
}
