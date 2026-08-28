package creatures

import (
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const (
	mimironLeviathanMkIIEntry    = 33432
	mimironLeviathanMkIIAltEntry = 34106
	mimironVX001Entry            = 33651
	mimironAerialCommandEntry    = 33670
	mimironSelfRepairSpellID     = 64383
)

const (
	MimironPhaseKeyP1 = "mimiron_p1"
	MimironPhaseKeyP2 = "mimiron_p2"
	MimironPhaseKeyP3 = "mimiron_p3"
	MimironPhaseKeyP4 = "mimiron_p4"
)

var MimironPhaseDefinitions = &phases.EncounterPhases{
	EncounterName: "Mimiron",
	Definitions: []phases.Definition{
		{Key: MimironPhaseKeyP1, Name: "Leviathan Mk II", Order: 0},
		{Key: MimironPhaseKeyP2, Name: "VX-001", Order: 1},
		{Key: MimironPhaseKeyP3, Name: "Aerial Command Unit", Order: 2},
		{Key: MimironPhaseKeyP4, Name: "V-07-TR-0N", Order: 3},
	},
}

type mimironRole uint8

const (
	mimironRoleUnknown mimironRole = iota
	mimironRoleLeviathan
	mimironRoleVX001
	mimironRoleAerial
)

const mimironStateKey = "wotlk_mimiron"

type mimironState struct {
	phase             int
	phaseSource       guid.GUID
	characters        map[guid.GUID]*mimironCharacter
	phaseFourDamaged  map[mimironRole]bool
	phaseFourDefeated map[mimironRole]bool
}

func loadMimironState(all *characters.Characters) *mimironState {
	shared, ok := all.Load(mimironStateKey)
	if !ok {
		shared = &mimironState{characters: make(map[guid.GUID]*mimironCharacter)}
		all.Save(mimironStateKey, shared)
	}
	return shared.(*mimironState)
}

type mimironCharacter struct {
	*characters.Common
	all   *characters.Characters
	entry uint32
	role  mimironRole
	state *mimironState
}

func NewMimironEncounterCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}
	role := mimironRoleForEntry(entry)
	if role == mimironRoleUnknown {
		return nil, false
	}

	state := loadMimironState(all)
	character := &mimironCharacter{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
		entry:  entry,
		role:   role,
		state:  state,
	}
	state.characters[id] = character
	return character, true
}

func (c *mimironCharacter) PhaseDefinitions() *phases.EncounterPhases {
	return MimironPhaseDefinitions
}

func (c *mimironCharacter) Process(m messages.Message) error {
	wasActive := c.IsActive()
	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}

	c.observePhaseSignal(m)
	if err := characters.ProcessCommonActivity(c, m); err != nil {
		return err
	}

	if wasActive && !c.IsActive() {
		c.resetStateIfInactive()
	}
	return nil
}

func (c *mimironCharacter) Start(reason string, m messages.Message) {
	if !c.anyEncounterUnitActive() {
		c.resetState()
		c.state.phaseSource = c.ID()
	}
	c.bumpLinked(reason, m)
	c.Common.Start(reason, m)
}

func (c *mimironCharacter) Bump(reason string, m messages.Message) {
	c.bumpLinked(reason, m)
	c.Common.Bump(reason, m)
}

func (c *mimironCharacter) Died(reason string, m messages.Message) {
	if c.state.phase < 4 {
		// The first three machines are disabled, then reused in phase four. Keep
		// the encounter open instead of treating those scripted defeats as kills.
		c.Bump("mimiron_phase_defeat", m)
		return
	}
	c.markPhaseFourDefeated(c.role, m)
}

func (c *mimironCharacter) observePhaseSignal(m messages.Message) {
	if damage, ok := m.(*messages.Damage); ok && damage.Target == c.ID() && isSuccessfulMimironDamage(damage) {
		switch {
		case c.state.phase <= 1 && c.role == mimironRoleVX001:
			c.transitionTo(2, MimironPhaseKeyP2, m)
		case c.state.phase == 2 && c.role == mimironRoleAerial:
			c.transitionTo(3, MimironPhaseKeyP3, m)
		case c.state.phase == 3 && c.role != mimironRoleAerial:
			// During phase three only the Aerial Command Unit is attackable. A
			// successful hit on either lower component means V-07-TR-0N is active.
			c.transitionTo(4, MimironPhaseKeyP4, m)
		}
		if c.state.phase == 4 {
			c.state.phaseFourDamaged[c.role] = true
		}
	}

	if target, ok := mimironSelfRepairTarget(m); ok && target == c.ID() {
		if c.state.phase == 3 {
			c.transitionTo(4, MimironPhaseKeyP4, m)
		}
		if c.state.phase == 4 && c.state.phaseFourDamaged[c.role] {
			c.markPhaseFourDefeated(c.role, m)
		}
	}
}

func (c *mimironCharacter) transitionTo(phase int, key string, m messages.Message) {
	if c.state.phaseSource.IsZero() || phase != c.state.phase+1 {
		return
	}
	c.all.EmitPhaseTransition(phases.Transition{
		SourceGUID: c.state.phaseSource,
		ToPhaseKey: key,
		Timestamp:  m.Date(),
	})
	c.state.phase = phase
	if phase == 4 {
		c.state.phaseFourDamaged = make(map[mimironRole]bool)
		c.state.phaseFourDefeated = make(map[mimironRole]bool)
	}
}

func (c *mimironCharacter) markPhaseFourDefeated(role mimironRole, m messages.Message) {
	if c.state.phase != 4 || role == mimironRoleUnknown || c.state.phaseFourDefeated[role] {
		return
	}
	c.state.phaseFourDefeated[role] = true
	if !c.allPhaseFourComponentsDefeated() {
		return
	}

	for _, linked := range c.state.characters {
		if linked.IsActive() {
			linked.Common.Died("mimiron_phase_four_complete", m)
		}
	}
}

func (c *mimironCharacter) allPhaseFourComponentsDefeated() bool {
	return c.state.phaseFourDefeated[mimironRoleLeviathan] &&
		c.state.phaseFourDefeated[mimironRoleVX001] &&
		c.state.phaseFourDefeated[mimironRoleAerial]
}

func (c *mimironCharacter) bumpLinked(reason string, m messages.Message) {
	for _, linked := range c.state.characters {
		if linked == c || !linked.IsActive() {
			continue
		}
		linked.Common.Bump(reason, m)
	}
}

func (c *mimironCharacter) anyEncounterUnitActive() bool {
	for _, linked := range c.state.characters {
		if linked.IsActive() {
			return true
		}
	}
	return false
}

func (c *mimironCharacter) resetStateIfInactive() {
	if !c.anyEncounterUnitActive() {
		c.resetState()
	}
}

func (c *mimironCharacter) resetState() {
	c.state.phase = 1
	c.state.phaseSource = 0
	c.state.phaseFourDamaged = make(map[mimironRole]bool)
	c.state.phaseFourDefeated = make(map[mimironRole]bool)
}

func mimironRoleForEntry(entry uint32) mimironRole {
	switch entry {
	case mimironLeviathanMkIIEntry, mimironLeviathanMkIIAltEntry:
		return mimironRoleLeviathan
	case mimironVX001Entry:
		return mimironRoleVX001
	case mimironAerialCommandEntry:
		return mimironRoleAerial
	default:
		return mimironRoleUnknown
	}
}

func isSuccessfulMimironDamage(damage *messages.Damage) bool {
	return damage.Amount > 0 &&
		!damage.HitType.Has(types.HitTypeImmune) &&
		!damage.HitType.Has(types.HitTypeEvade)
}

func mimironSelfRepairTarget(m messages.Message) (guid.GUID, bool) {
	switch event := m.(type) {
	case *messages.SpellStart:
		if event.SpellData != nil && event.SpellData.ID == mimironSelfRepairSpellID {
			return event.Caster, true
		}
	case *messages.SpellGo:
		if event.SpellData != nil && event.SpellData.ID == mimironSelfRepairSpellID {
			return event.Caster, true
		}
	case *messages.Aura:
		if (event.SpellData != nil && event.SpellData.ID == mimironSelfRepairSpellID) ||
			strings.EqualFold(event.SpellName, "Self Repair") {
			return event.Target, true
		}
	case *messages.LegacyCast:
		if strings.EqualFold(event.Spell, "Self Repair") {
			return event.Caster, true
		}
	}
	return 0, false
}
