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
	yoggSaronEntry            = 33288
	yoggSaronBrainEntry       = 33890
	yoggSaronGuardianEntry    = 33136
	yoggSaronSaraEntry        = 33134
	yoggSaronSaraAltEntry     = 34332
	yoggSaronCrusherEntry     = 33966
	yoggSaronConstrictorEntry = 33983
	yoggSaronCorruptorEntry   = 33985
	yoggSaronInfluenceEntry   = 33943
	yoggSaronImmortalEntry    = 33988
)

const (
	YoggSaronPhaseKeyP1 = "yogg_saron_p1"
	YoggSaronPhaseKeyP2 = "yogg_saron_p2"
	YoggSaronPhaseKeyP3 = "yogg_saron_p3"
)

var YoggSaronPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Yogg-Saron",
	Definitions: []phases.Definition{
		{Key: YoggSaronPhaseKeyP1, Name: "Guardians", Order: 0},
		{Key: YoggSaronPhaseKeyP2, Name: "Mind", Order: 1},
		{Key: YoggSaronPhaseKeyP3, Name: "Old God", Order: 2},
	},
}

var yoggSaronEncounterEntries = []uint32{
	yoggSaronEntry,
	yoggSaronBrainEntry,
	yoggSaronGuardianEntry,
	yoggSaronSaraEntry,
	yoggSaronSaraAltEntry,
	yoggSaronCrusherEntry,
	yoggSaronConstrictorEntry,
	yoggSaronCorruptorEntry,
	yoggSaronInfluenceEntry,
	yoggSaronImmortalEntry,
	33716, 33717, 33718, 33719, 33720, // Dragon Soul illusion consorts.
	33567, // Deathsworn Zealot, Icecrown illusion.
	33433, // Suit of Armor, Stormwind illusion.
}

const yoggSaronStateKey = "wotlk_yogg_saron"

type yoggSaronState struct {
	phase       int
	phaseSource guid.GUID
	characters  map[guid.GUID]*yoggSaronCharacter
}

func loadYoggSaronState(all *characters.Characters) *yoggSaronState {
	shared, ok := all.Load(yoggSaronStateKey)
	if !ok {
		shared = &yoggSaronState{
			phase:      1,
			characters: make(map[guid.GUID]*yoggSaronCharacter),
		}
		all.Save(yoggSaronStateKey, shared)
	}
	return shared.(*yoggSaronState)
}

type yoggSaronGuardian struct {
	*characters.Common
	all *characters.Characters
}

func NewYoggSaronGuardian(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != yoggSaronGuardianEntry {
		return nil, false
	}
	return &yoggSaronGuardian{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

func (c *yoggSaronGuardian) Process(m messages.Message) error {
	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	return characters.ProcessCommonActivity(c, m)
}

func (c *yoggSaronGuardian) Start(reason string, m messages.Message) {
	c.Common.Start(reason, m)
	c.bumpSara(m)
}

func (c *yoggSaronGuardian) Bump(reason string, m messages.Message) {
	c.Common.Bump(reason, m)
	c.bumpSara(m)
}

func (c *yoggSaronGuardian) bumpSara(m messages.Message) {
	for _, entry := range []uint32{yoggSaronSaraEntry, yoggSaronSaraAltEntry} {
		for _, sara := range c.all.ByEntry[entry] {
			boss, ok := sara.(characters.CharacterBase)
			if !ok {
				continue
			}
			if boss.IsActive() {
				boss.Bump("guardian_of_yogg_saron_activity", m)
			} else {
				boss.Start("guardian_of_yogg_saron_activity", m)
			}
		}
	}
}

type yoggSaronCharacter struct {
	*characters.Common
	all   *characters.Characters
	entry uint32
	state *yoggSaronState
}

func NewYoggSaronEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || !isYoggSaronEncounterEntry(entry) {
		return nil, false
	}

	state := loadYoggSaronState(all)

	base := characters.NewCommonCharacter(id, all)
	if isYoggSaronAnchorEntry(entry) {
		// Keep all three observed encounter anchors alive together. The longer
		// timeout also bridges Sara's roughly 64-second phase transition.
		base.WithTimeout(90 * time.Second)
	}

	c := &yoggSaronCharacter{
		Common: base,
		all:    all,
		entry:  entry,
		state:  state,
	}
	state.characters[id] = c
	return c, true
}

func (c *yoggSaronCharacter) PhaseDefinitions() *phases.EncounterPhases {
	if c.entry != yoggSaronSaraEntry && c.entry != yoggSaronSaraAltEntry {
		return nil
	}
	return YoggSaronPhaseDefinitions
}

func (c *yoggSaronCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	transitionedToP2 := false

	if damage, ok := m.(*messages.Damage); ok {
		if c.state.phase == 1 && damageInvolvesYoggSaronPhaseTwo(damage) {
			c.emitTransition(YoggSaronPhaseKeyP2, damage)
			c.state.phase = 2
			transitionedToP2 = true
		}

		if !transitionedToP2 && c.state.phase == 2 && isYoggSaronPhaseThreeHit(damage) {
			c.emitTransition(YoggSaronPhaseKeyP3, damage)
			c.state.phase = 3
		}
	}

	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	if err := characters.ProcessCommonActivity(c, m); err != nil {
		return err
	}

	if wasActive && !c.IsActive() {
		c.resetStateIfInactive()
	}
	return nil
}

func (c *yoggSaronCharacter) Start(reason string, m messages.Message) {
	if !c.anyEncounterUnitActive() {
		c.state.phase = 1
		c.state.phaseSource = 0
	}

	if c.isSara() {
		c.state.phaseSource = c.ID()
	}

	c.bumpLinked("yogg_saron_linked_activity", m)
	c.Common.Start(reason, m)
}

func (c *yoggSaronCharacter) Bump(reason string, m messages.Message) {
	c.bumpLinked("yogg_saron_linked_activity", m)
	c.Common.Bump(reason, m)
}

func (c *yoggSaronCharacter) Died(reason string, m messages.Message) {
	c.Common.Died(reason, m)
	if c.entry == yoggSaronEntry {
		c.endLinkedOnYoggSaronDeath(m)
	}
	c.resetStateIfInactive()
}

func (c *yoggSaronCharacter) isSara() bool {
	return c.entry == yoggSaronSaraEntry || c.entry == yoggSaronSaraAltEntry
}

func (c *yoggSaronCharacter) emitTransition(toPhase string, m messages.Message) {
	if c.state.phaseSource.IsZero() {
		return
	}
	c.all.EmitPhaseTransition(phases.Transition{
		SourceGUID: c.state.phaseSource,
		ToPhaseKey: toPhase,
		Timestamp:  m.Date(),
	})
}

func (c *yoggSaronCharacter) bumpLinked(reason string, m messages.Message) {
	for _, linked := range c.state.characters {
		if linked == c || !linked.IsActive() {
			continue
		}
		linked.Common.Bump(reason, m)
	}
}

func (c *yoggSaronCharacter) endLinkedOnYoggSaronDeath(m messages.Message) {
	for _, linked := range c.state.characters {
		if linked == c || !linked.IsActive() {
			continue
		}

		if isYoggSaronAnchorEntry(linked.entry) {
			// Sara and the Brain never produce their own slain events. Model the
			// three encounter anchors as dying together with Yogg-Saron.
			linked.Died("yogg_saron_slain", m)
			continue
		}

		// Immortal Guardians and the other encounter adds despawn when the
		// encounter completes. Do not fabricate kills for them.
		linked.End("yogg_saron_encounter_complete", m, period.EndStateReset)
	}
}

func isYoggSaronAnchorEntry(entry uint32) bool {
	switch entry {
	case yoggSaronEntry, yoggSaronBrainEntry, yoggSaronSaraEntry, yoggSaronSaraAltEntry:
		return true
	default:
		return false
	}
}

func (c *yoggSaronCharacter) anyEncounterUnitActive() bool {
	for _, char := range c.state.characters {
		if char.IsActive() {
			return true
		}
	}
	return false
}

func (c *yoggSaronCharacter) resetStateIfInactive() {
	if c.anyEncounterUnitActive() {
		return
	}
	c.state.phase = 1
	c.state.phaseSource = 0
}

func isYoggSaronEncounterEntry(entry uint32) bool {
	for _, candidate := range yoggSaronEncounterEntries {
		if entry == candidate {
			return true
		}
	}
	return false
}

func isYoggSaronPhaseTwoEntry(entry uint32) bool {
	switch entry {
	case yoggSaronEntry, yoggSaronBrainEntry,
		yoggSaronCrusherEntry, yoggSaronConstrictorEntry,
		yoggSaronCorruptorEntry, yoggSaronInfluenceEntry,
		33716, 33717, 33718, 33719, 33720, 33567, 33433:
		return true
	default:
		return false
	}
}

func damageInvolvesYoggSaronPhaseTwo(damage *messages.Damage) bool {
	if entry, ok := damage.Target.GetEntry(); ok && isYoggSaronPhaseTwoEntry(entry) {
		return true
	}
	if damage.Caster != nil {
		if entry, ok := damage.Caster.GetEntry(); ok && isYoggSaronPhaseTwoEntry(entry) {
			return true
		}
	}
	return false
}

func isYoggSaronPhaseThreeHit(damage *messages.Damage) bool {
	entry, ok := damage.Target.GetEntry()
	if !ok || entry != yoggSaronEntry {
		return false
	}
	return !damage.HitType.Has(types.HitTypeImmune) && !damage.HitType.Has(types.HitTypeEvade)
}
