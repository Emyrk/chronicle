package encounter

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
)

// KillType represents the outcome of an encounter.
type KillType string

const (
	// KillTypeClean means all hostiles were killed - a complete victory.
	KillTypeClean KillType = "clean"
	// KillTypePartial means the boss was killed but adds remain alive.
	KillTypePartial KillType = "partial"
	// KillTypeWipe means the boss was not killed - raid wiped or reset.
	KillTypeWipe KillType = "wipe"
	// KillTypeReset is when all the mobs were reset
	KillTypeReset KillType = "reset"
)

// Encounter represents a named combat period in the logs.
type Encounter struct {
	// Name is the identifier for this encounter.
	Name string
	Type types.EncounterType

	// Period identifies the start/end of combat
	Combat Fight
	// KillType indicates the outcome of the encounter
	KillType  KillType
	Remaining []guid.GUID
	Boss      bool

	// Phases are optional sub-ranges within the encounter, ordered by Phase.Order.
	Phases []Phase
}

func (e Encounter) NamedString(db *unitdb.Units) string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("%s Fight [KillType=%s]: against %d units\n", e.Type, e.KillType, len(e.Combat.Hostiles)))
	str.WriteString(fmt.Sprintf("  Start: %s\n", e.Combat.Start.Format("15:04:05.000")))
	str.WriteString(fmt.Sprintf("  End:   %s\n", e.Combat.End.Format("15:04:05.000")))
	str.WriteString("  Hostiles:\n")
	for charID, charFight := range e.Combat.Hostiles {
		unit, ok := db.Get(charID)
		unitName := unitname.ByGUID(charID)
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
	EncounterID uuid.UUID
	// Hostiles contains all hostile characters that participated in this fight.
	// Each CharacterFight contains all activity periods from that character
	// that belong to this fight.
	Hostiles     map[guid.GUID]CharacterFight
	PlayerDeaths []messages.Message

	// Start is the earliest start time across all hostile activity periods.
	Start time.Time

	// End is the latest end time across all hostile activity periods.
	End time.Time
}

type EndStatesReport struct {
	Slain    int
	Reset    int
	Timeouts []guid.GUID
}

func (f Fight) EndStates() EndStatesReport {
	slain := 0
	reset := 0
	timeouts := make([]guid.GUID, 0)
	for _, h := range f.Hostiles {
		switch h.Activity[len(h.Activity)-1].EndState {
		case period.EndStateSlain:
			slain++
		case period.EndStateReset:
			reset++
		default:
			timeouts = append(timeouts, h.ID)
		}
	}
	return EndStatesReport{
		Slain:    slain,
		Reset:    reset,
		Timeouts: timeouts,
	}
}

func (f Fight) NamedString(db *unitdb.Units) string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("Fight: against %d units\n", len(f.Hostiles)))
	str.WriteString(fmt.Sprintf("  Start: %s\n", f.Start.Format("15:04:05.000")))
	str.WriteString(fmt.Sprintf("  End:   %s\n", f.End.Format("15:04:05.000")))
	str.WriteString("  Hostiles:\n")
	for charID, charFight := range f.Hostiles {
		unit, ok := db.Get(charID)
		unitName := unitname.ByGUID(charID)
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
