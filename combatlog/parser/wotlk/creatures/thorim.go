package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const thorimEntry = 32865

const (
	ThorimPhaseKeyP1 = "thorim_p1"
	ThorimPhaseKeyP2 = "thorim_p2"
	ThorimPhaseKeyP3 = "thorim_p3"
)

var ThorimPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Thorim",
	Definitions: []phases.Definition{
		{Key: ThorimPhaseKeyP1, Name: "Arena", Order: 0},
		{Key: ThorimPhaseKeyP2, Name: "Gauntlet", Order: 1},
		{Key: ThorimPhaseKeyP3, Name: "Thorim", Order: 2},
	},
}

var thorimEncounterEntries = []uint32{
	thorimEntry,

	// Arena start.
	32882, // Jormungar Behemoth
	32883, // Captured Mercenary Soldier (Horde)
	32885, // Captured Mercenary Soldier (Alliance)
	32886, // Dark Rune Acolyte
	32907, // Captured Mercenary Captain (Horde)
	32908, // Captured Mercenary Captain (Alliance)

	// Arena waves.
	32876, // Dark Rune Champion
	32877, // Dark Rune Warbringer
	32878, // Dark Rune Evoker
	32904, // Dark Rune Commoner

	// Gauntlet.
	32872, // Runic Colossus
	32873, // Ancient Rune Giant
	32874, // Iron Ring Guard
	32875, // Iron Honor Guard
	33110, // Dark Rune Acolyte

	// Encounter helpers that can participate in combat.
	33138, // Lightning Orb
	33378, // Thunder Orb
}

var thorimGauntletEntries = map[uint32]struct{}{
	32872: {}, // Runic Colossus
	32873: {}, // Ancient Rune Giant
	32874: {}, // Iron Ring Guard
	32875: {}, // Iron Honor Guard
	33110: {}, // Dark Rune Acolyte
}

const thorimStateKey = "wotlk_thorim"

type thorimState struct {
	phase       int
	phaseSource guid.GUID
	characters  map[guid.GUID]*thorimCharacter
}

func loadThorimState(all *characters.Characters) *thorimState {
	shared, ok := all.Load(thorimStateKey)
	if !ok {
		shared = &thorimState{
			phase:      1,
			characters: make(map[guid.GUID]*thorimCharacter),
		}
		all.Save(thorimStateKey, shared)
	}
	return shared.(*thorimState)
}

type thorimCharacter struct {
	*characters.RoomMechanic
	all   *characters.Characters
	entry uint32
	state *thorimState
}

func NewSif(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != 33196 {
		return nil, false
	}
	return characters.NewNeverActive(id), true
}

func NewThorimEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || !isThorimEncounterEntry(entry) {
		return nil, false
	}

	roomMechanic, ok := characters.NewRoomMechanic(id, thorimEntry, all)
	if !ok {
		return nil, false
	}

	c := &thorimCharacter{
		RoomMechanic: roomMechanic,
		all:          all,
		entry:        entry,
		state:        loadThorimState(all),
	}
	c.state.characters[id] = c
	return c, true
}

func (c *thorimCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return ThorimPhaseDefinitions
}

func (c *thorimCharacter) Process(m messages.Message) error {
	wasAnyActive := c.anyEncounterUnitActive()
	wasActive := c.IsActive()

	if err := c.RoomMechanic.Process(m); err != nil {
		return err
	}

	if !wasAnyActive && c.anyEncounterUnitActive() {
		c.state.phase = 1
		c.state.phaseSource = c.ID()
	}

	if damage, ok := m.(*messages.Damage); ok {
		if c.state.phase == 1 && isThorimGauntletHit(damage) {
			c.emitTransition(ThorimPhaseKeyP2, damage)
			c.state.phase = 2
		}
		if c.state.phase == 2 && isThorimBossHit(damage) {
			c.emitTransition(ThorimPhaseKeyP3, damage)
			c.state.phase = 3
		}
		if c.entry == thorimEntry && isThorimDefeatHit(damage) {
			// Thorim surrenders instead of emitting UNIT_DIED. The combat log still
			// reports the triggering hit with positive overkill, so use that as the
			// encounter's slain signal. RoomMechanic flushes the pending room deaths.
			c.Died("thorim_defeated", damage)
		}
	}

	if wasActive && !c.IsActive() {
		c.resetStateIfInactive()
	}
	return nil
}

func (c *thorimCharacter) emitTransition(toPhase string, m messages.Message) {
	if c.state.phaseSource.IsZero() {
		return
	}
	c.all.EmitPhaseTransition(phases.Transition{
		SourceGUID: c.state.phaseSource,
		ToPhaseKey: toPhase,
		Timestamp:  m.Date(),
	})
}

func (c *thorimCharacter) anyEncounterUnitActive() bool {
	for _, linked := range c.state.characters {
		if linked.IsActive() {
			return true
		}
	}
	return false
}

func (c *thorimCharacter) resetStateIfInactive() {
	if c.anyEncounterUnitActive() {
		return
	}
	c.state.phase = 1
	c.state.phaseSource = 0
}

func isThorimEncounterEntry(entry uint32) bool {
	for _, candidate := range thorimEncounterEntries {
		if entry == candidate {
			return true
		}
	}
	return false
}

func isThorimGauntletHit(damage *messages.Damage) bool {
	if !isSuccessfulThorimDamage(damage) {
		return false
	}
	for _, id := range damage.Affects() {
		entry, ok := id.GetEntry()
		if !ok {
			continue
		}
		if _, ok := thorimGauntletEntries[entry]; ok {
			return true
		}
	}
	return false
}

func isThorimBossHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	return ok && entry == thorimEntry && isSuccessfulThorimDamage(damage)
}

func isSuccessfulThorimDamage(damage *messages.Damage) bool {
	return damage.Amount > 0 &&
		!damage.HitType.Has(types.HitTypeImmune) &&
		!damage.HitType.Has(types.HitTypeEvade)
}

func isThorimDefeatHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	return ok && entry == thorimEntry && damage.Overkill > 0
}
