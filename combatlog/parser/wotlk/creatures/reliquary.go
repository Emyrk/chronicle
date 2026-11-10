package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const (
	reliquaryOfSoulsEntry   = 22856
	essenceOfSufferingEntry = 23418
	essenceOfDesireEntry    = 23419
	essenceOfAngerEntry     = 23420

	reliquaryIntermissionTimeout = 2 * time.Minute
)

const (
	ReliquaryPhaseKeySuffering = "reliquary_suffering"
	ReliquaryPhaseKeyDesire    = "reliquary_desire"
	ReliquaryPhaseKeyAnger     = "reliquary_anger"
)

var ReliquaryPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Reliquary of Souls",
	Definitions: []phases.Definition{
		{Key: ReliquaryPhaseKeySuffering, Name: "Essence of Suffering", Order: 0},
		{Key: ReliquaryPhaseKeyDesire, Name: "Essence of Desire", Order: 1},
		{Key: ReliquaryPhaseKeyAnger, Name: "Essence of Anger", Order: 2},
	},
}

const reliquaryStateKey = "tbc_reliquary"

type reliquaryState struct {
	phase       int
	phaseSource guid.GUID
	characters  map[guid.GUID]*reliquaryCharacter
}

func loadReliquaryState(all *characters.Characters) *reliquaryState {
	shared, ok := all.Load(reliquaryStateKey)
	if !ok {
		shared = &reliquaryState{
			phase:      1,
			characters: make(map[guid.GUID]*reliquaryCharacter),
		}
		all.Save(reliquaryStateKey, shared)
	}
	return shared.(*reliquaryState)
}

type reliquaryCharacter struct {
	*characters.RoomMechanic
	all   *characters.Characters
	state *reliquaryState
}

func NewReliquaryEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || !isReliquaryEncounterEntry(entry) {
		return nil, false
	}

	roomMechanic, ok := characters.NewRoomMechanic(id, essenceOfAngerEntry, all)
	if !ok {
		return nil, false
	}
	roomMechanic.WithPendingDeathWindow(reliquaryIntermissionTimeout)

	state := loadReliquaryState(all)
	character := &reliquaryCharacter{
		RoomMechanic: roomMechanic,
		all:          all,
		state:        state,
	}
	state.characters[id] = character
	return character, true
}

func (c *reliquaryCharacter) PhaseDefinitions() *phases.EncounterPhases {
	if c.state.phaseSource != c.ID() {
		return nil
	}
	return ReliquaryPhaseDefinitions
}

func (c *reliquaryCharacter) Process(m messages.Message) error {
	if evade, ok := m.(*messages.UnitEvade); ok && evade.UnitGUID == c.ID() {
		c.endEncounter("reliquary_evade", m)
		return nil
	}

	wasAnyActive := c.anyEncounterUnitActive()
	if err := c.RoomMechanic.Process(m); err != nil {
		return err
	}

	if !wasAnyActive && c.anyEncounterUnitActive() && c.state.phaseSource.IsZero() {
		c.state.phase = 1
		c.state.phaseSource = c.ID()
	}

	phaseAdvanced := false
	if damage, ok := m.(*messages.Damage); ok && isSuccessfulReliquaryDamage(damage) {
		entry, hasEntry := damage.Target.GetEntry()
		switch {
		case hasEntry && c.state.phase == 1 && entry == essenceOfDesireEntry:
			phaseAdvanced = c.transitionTo(2, ReliquaryPhaseKeyDesire, damage)
			if phaseAdvanced {
				c.finishPhase(essenceOfSufferingEntry, damage)
			}
		case hasEntry && c.state.phase == 2 && entry == essenceOfAngerEntry:
			phaseAdvanced = c.transitionTo(3, ReliquaryPhaseKeyAnger, damage)
			if phaseAdvanced {
				c.finishPhase(essenceOfDesireEntry, damage)
			}
		}
	}

	if wasAnyActive && !c.anyEncounterUnitActive() && !phaseAdvanced {
		c.resetState()
	}
	return nil
}

func (c *reliquaryCharacter) transitionTo(phase int, key string, m messages.Message) bool {
	if c.state.phaseSource.IsZero() || phase != c.state.phase+1 {
		return false
	}
	c.all.EmitPhaseTransition(phases.Transition{
		SourceGUID: c.state.phaseSource,
		ToPhaseKey: key,
		Timestamp:  m.Date(),
	})
	c.state.phase = phase
	return true
}

func (c *reliquaryCharacter) finishPhase(entry uint32, m messages.Message) {
	for _, linked := range c.state.characters {
		linkedEntry, ok := linked.ID().GetEntry()
		if ok && linkedEntry == entry && linked.IsActive() {
			linked.Complete("reliquary_phase_complete", m)
		}
	}
}

func (c *reliquaryCharacter) anyEncounterUnitActive() bool {
	for _, linked := range c.state.characters {
		if linked.IsActive() {
			return true
		}
	}
	return false
}

func (c *reliquaryCharacter) endEncounter(reason string, m messages.Message) {
	members := make([]*characters.RoomMechanic, 0, len(c.state.characters))
	for _, linked := range c.state.characters {
		if linked.IsActive() {
			linked.End(reason, m, period.EndStateReset)
		}
		members = append(members, linked.RoomMechanic)
	}
	c.ResetRoom(members...)
	c.resetState()
}

func (c *reliquaryCharacter) resetState() {
	c.state.phase = 1
	c.state.phaseSource = 0
}

func isReliquaryEncounterEntry(entry uint32) bool {
	return entry == reliquaryOfSoulsEntry ||
		entry == essenceOfSufferingEntry ||
		entry == essenceOfDesireEntry ||
		entry == essenceOfAngerEntry
}

func isSuccessfulReliquaryDamage(damage *messages.Damage) bool {
	return damage.Amount > 0 &&
		!damage.HitType.Has(types.HitTypeImmune) &&
		!damage.HitType.Has(types.HitTypeEvade)
}
