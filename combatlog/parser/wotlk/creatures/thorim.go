package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const thorimEntry = 32865

const (
	ThorimPhaseKeyP1 = "thorim_p1"
	ThorimPhaseKeyP2 = "thorim_p2"
)

var ThorimPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Thorim",
	Definitions: []phases.Definition{
		{Key: ThorimPhaseKeyP1, Name: "Arena and Gauntlet", Order: 0},
		{Key: ThorimPhaseKeyP2, Name: "Thorim", Order: 1},
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
	*characters.Common
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

	c := &thorimCharacter{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
		entry:  entry,
		state:  loadThorimState(all),
	}
	c.state.characters[id] = c
	return c, true
}

func (c *thorimCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return ThorimPhaseDefinitions
}

func (c *thorimCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()

	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	if err := characters.ProcessCommonActivity(c, m); err != nil {
		return err
	}

	if damage, ok := m.(*messages.Damage); ok {
		if c.state.phase == 1 && isThorimPhaseTwoHit(damage) {
			c.all.EmitPhaseTransition(phases.Transition{
				SourceGUID: c.state.phaseSource,
				ToPhaseKey: ThorimPhaseKeyP2,
				Timestamp:  m.Date(),
			})
			c.state.phase = 2
		}
		if c.entry == thorimEntry && isThorimDefeatHit(damage) {
			// Thorim surrenders instead of emitting UNIT_DIED. The combat log still
			// reports the triggering hit with positive overkill, so use that as the
			// encounter's slain signal.
			c.Died("thorim_defeated", damage)
		}
	}

	if wasActive && !c.IsActive() {
		c.resetStateIfInactive()
	}
	return nil
}

func (c *thorimCharacter) Start(reason string, m messages.Message) {
	if !c.anyEncounterUnitActive() {
		c.state.phase = 1
		c.state.phaseSource = c.ID()
	}

	c.bumpLinked("thorim_linked_activity", m)
	c.Common.Start(reason, m)
}

func (c *thorimCharacter) Bump(reason string, m messages.Message) {
	c.bumpLinked("thorim_linked_activity", m)
	c.Common.Bump(reason, m)
}

func (c *thorimCharacter) Died(reason string, m messages.Message) {
	c.Common.Died(reason, m)
	if c.entry == thorimEntry {
		c.endLinkedOnThorimDefeat(m)
	}
	c.resetStateIfInactive()
}

func (c *thorimCharacter) bumpLinked(reason string, m messages.Message) {
	for _, linked := range c.state.characters {
		if linked == c || !linked.IsActive() {
			continue
		}
		linked.Common.Bump(reason, m)
	}
}

func (c *thorimCharacter) endLinkedOnThorimDefeat(m messages.Message) {
	for _, linked := range c.state.characters {
		if linked == c || !linked.IsActive() {
			continue
		}
		linked.End("thorim_encounter_complete", m, period.EndStateReset)
	}
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

func isThorimPhaseTwoHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	if !ok || entry != thorimEntry || damage.Amount <= 0 {
		return false
	}
	return !damage.HitType.Has(types.HitTypeImmune) && !damage.HitType.Has(types.HitTypeEvade)
}

func isThorimDefeatHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	return ok && entry == thorimEntry && damage.Overkill > 0
}
