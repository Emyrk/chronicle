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
	kaelThasEntry  = 19622
	lordSanguinar  = 20060
	capernianEntry = 20062
	telonicusEntry = 20063
	thaladredEntry = 20064

	netherstrandLongbowEntry    = 21268
	devastationEntry            = 21269
	cosmicInfuserEntry          = 21270
	infinityBladesEntry         = 21271
	warpSlicerEntry             = 21272
	phaseshiftBulwarkEntry      = 21273
	staffOfDisintegrationEntry  = 21274
	kaelThasIntermissionTimeout = 3 * time.Minute
	kaelThasPendingDeathWindow  = 2 * time.Minute
)

const (
	KaelThasPhaseKeyAdvisors    = "kaelthas_advisors"
	KaelThasPhaseKeyWeapons     = "kaelthas_weapons"
	KaelThasPhaseKeyResurrected = "kaelthas_resurrected_advisors"
	KaelThasPhaseKeyKaelThas    = "kaelthas_boss"
)

var KaelThasPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Kael'thas Sunstrider",
	Definitions: []phases.Definition{
		{Key: KaelThasPhaseKeyAdvisors, Name: "Advisors", Order: 0},
		{Key: KaelThasPhaseKeyWeapons, Name: "Weapons", Order: 1},
		{Key: KaelThasPhaseKeyResurrected, Name: "Resurrected Advisors", Order: 2},
		{Key: KaelThasPhaseKeyKaelThas, Name: "Kael'thas", Order: 3},
	},
}

var kaelThasAdvisorEntries = map[uint32]struct{}{
	lordSanguinar:  {},
	capernianEntry: {},
	telonicusEntry: {},
	thaladredEntry: {},
}

var kaelThasWeaponEntries = map[uint32]struct{}{
	netherstrandLongbowEntry:   {},
	devastationEntry:           {},
	cosmicInfuserEntry:         {},
	infinityBladesEntry:        {},
	warpSlicerEntry:            {},
	phaseshiftBulwarkEntry:     {},
	staffOfDisintegrationEntry: {},
}

const kaelThasStateKey = "tbc_kaelthas"

type kaelThasState struct {
	phase               int
	phaseSource         guid.GUID
	weaponDeathObserved bool
	characters          map[guid.GUID]*kaelThasCharacter
}

func loadKaelThasState(all *characters.Characters) *kaelThasState {
	shared, ok := all.Load(kaelThasStateKey)
	if !ok {
		shared = &kaelThasState{
			phase:      1,
			characters: make(map[guid.GUID]*kaelThasCharacter),
		}
		all.Save(kaelThasStateKey, shared)
	}
	return shared.(*kaelThasState)
}

type kaelThasCharacter struct {
	*characters.RoomMechanic
	all   *characters.Characters
	state *kaelThasState
}

func NewKaelThasEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || !isKaelThasEncounterEntry(entry) {
		return nil, false
	}

	roomMechanic, ok := characters.NewRoomMechanic(id, kaelThasEntry, all)
	if !ok {
		return nil, false
	}
	roomMechanic.WithTimeout(kaelThasIntermissionTimeout)
	roomMechanic.WithPendingDeathWindow(kaelThasPendingDeathWindow)

	state := loadKaelThasState(all)
	character := &kaelThasCharacter{
		RoomMechanic: roomMechanic,
		all:          all,
		state:        state,
	}
	state.characters[id] = character
	return character, true
}

func (c *kaelThasCharacter) PhaseDefinitions() *phases.EncounterPhases {
	if c.state.phaseSource != c.ID() {
		return nil
	}
	return KaelThasPhaseDefinitions
}

func (c *kaelThasCharacter) Process(m messages.Message) error {
	if evade, ok := m.(*messages.UnitEvade); ok && evade.UnitGUID == c.ID() {
		c.endEncounter("kaelthas_evade", m)
		return nil
	}

	wasAnyActive := c.anyEncounterUnitActive()
	if err := c.RoomMechanic.Process(m); err != nil {
		return err
	}

	if !wasAnyActive && c.anyEncounterUnitActive() {
		c.state.phase = 1
		c.state.phaseSource = c.ID()
	}

	if slain, ok := m.(*messages.Slain); ok && guidHasEntry(slain.Victim, kaelThasWeaponEntries) {
		c.state.weaponDeathObserved = true
	}

	if damage, ok := m.(*messages.Damage); ok && isSuccessfulKaelThasDamage(damage) {
		switch {
		case c.state.phase == 1 && guidHasEntry(damage.Target, kaelThasWeaponEntries):
			c.transitionTo(2, KaelThasPhaseKeyWeapons, damage)
		case c.state.phase == 2 && c.state.weaponDeathObserved && guidHasEntry(damage.Target, kaelThasAdvisorEntries):
			c.transitionTo(3, KaelThasPhaseKeyResurrected, damage)
			c.finishActiveWeapons(damage)
		case c.state.phase == 3 && damageTargetsKaelThas(damage):
			c.transitionTo(4, KaelThasPhaseKeyKaelThas, damage)
		}
	}

	if wasAnyActive && !c.anyEncounterUnitActive() {
		c.resetState()
	}
	return nil
}

func (c *kaelThasCharacter) transitionTo(phase int, key string, m messages.Message) {
	if c.state.phaseSource.IsZero() || phase != c.state.phase+1 {
		return
	}
	c.all.EmitPhaseTransition(phases.Transition{
		SourceGUID: c.state.phaseSource,
		ToPhaseKey: key,
		Timestamp:  m.Date(),
	})
	c.state.phase = phase
}

func (c *kaelThasCharacter) finishActiveWeapons(m messages.Message) {
	for _, linked := range c.state.characters {
		entry, ok := linked.ID().GetEntry()
		if !ok {
			continue
		}
		if _, weapon := kaelThasWeaponEntries[entry]; weapon && linked.IsActive() {
			linked.Complete("kaelthas_weapons_complete", m)
		}
	}
}

func (c *kaelThasCharacter) anyEncounterUnitActive() bool {
	for _, linked := range c.state.characters {
		if linked.IsActive() {
			return true
		}
	}
	return false
}

func (c *kaelThasCharacter) endEncounter(reason string, m messages.Message) {
	for _, linked := range c.state.characters {
		if linked.IsActive() {
			linked.End(reason, m, period.EndStateReset)
		}
	}
	members := make([]*characters.RoomMechanic, 0, len(c.state.characters))
	for _, linked := range c.state.characters {
		members = append(members, linked.RoomMechanic)
	}
	c.ResetRoom(members...)
	c.resetState()
}

func (c *kaelThasCharacter) resetState() {
	c.state.phase = 1
	c.state.phaseSource = 0
	c.state.weaponDeathObserved = false
}

func isKaelThasEncounterEntry(entry uint32) bool {
	if entry == kaelThasEntry {
		return true
	}
	if _, ok := kaelThasAdvisorEntries[entry]; ok {
		return true
	}
	_, ok := kaelThasWeaponEntries[entry]
	return ok
}

func guidHasEntry(id guid.GUID, entries map[uint32]struct{}) bool {
	entry, ok := id.GetEntry()
	if !ok {
		return false
	}
	_, ok = entries[entry]
	return ok
}

func damageTargetsKaelThas(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	return ok && entry == kaelThasEntry
}

func isSuccessfulKaelThasDamage(damage *messages.Damage) bool {
	return damage.Amount > 0 &&
		!damage.HitType.Has(types.HitTypeImmune) &&
		!damage.HitType.Has(types.HitTypeEvade)
}
