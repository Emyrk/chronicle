package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/google/uuid"
)

type OngoingFight struct {
	EncounterID    uuid.UUID
	ActiveHostiles map[guid.GUID]struct{}
	Events         *encounterevents.EncounterEventsInProgress
	// PlayerDeaths helps track a reset vs a "wipe".
	PlayerDeaths []messages.Message

	Start *period.Moment
	End   *period.Moment
}
