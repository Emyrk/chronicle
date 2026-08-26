package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/google/uuid"
)

type ongoingFight struct {
	EncounterID    uuid.UUID
	ActiveHostiles map[guid.GUID]struct{}
	Events         *encounterevents.EncounterEventsInProgress

	// PlayerDeaths helps track a reset vs a "wipe".
	PlayerDeaths []messages.Message

	// Phases tracks live encounter phase state. Initialized when a fight
	// starts and a participating hostile provides phase definitions.
	// Nil when the encounter has no phases.
	Phases *phaseTracker

	Start *period.Moment
	End   *period.Moment
}

func (f *ongoingFight) Begin(mom *period.Moment) {
	if f.Start == nil {
		f.Start = mom
		return
	}

	if f.Start.Timestamp.Date().After(mom.Timestamp.Date()) {
		f.Start = mom
	}
}

// Process will add the message to the events.
// Process should only be called when the fight is active.
func (f *ongoingFight) Process(m messages.Message) error {
	if !f.active() {
		return nil
	}

	switch msg := m.(type) {
	case *messages.Slain:
		if msg.Victim.IsPlayer() {
			f.PlayerDeaths = append(f.PlayerDeaths, msg)
		}
	}

	err := f.Events.Process(m)
	if err != nil {
		return err
	}

	return nil
}

func (f *ongoingFight) active() bool {
	if f == nil {
		return false
	}
	return f.Start != nil && f.End == nil
}
