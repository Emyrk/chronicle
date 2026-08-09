package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	malygosEntry         = 28859
	nexusLordEntry       = 30245
	scionOfEternityEntry = 30249
)

func NewMalygos(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != malygosEntry {
		return nil, false
	}

	c := characters.NewCommonCharacter(id, all)
	c.SetRecentlySlainDuration(time.Second * 45)
	return c, true
}

type malygosPhaseTwoAdd struct {
	*characters.Common
	all *characters.Characters
}

func NewNexusLord(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return newMalygosPhaseTwoAdd(id, all, nexusLordEntry)
}

func NewScionOfEternity(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return newMalygosPhaseTwoAdd(id, all, scionOfEternityEntry)
}

func newMalygosPhaseTwoAdd(id guid.GUID, all *characters.Characters, expectedEntry uint32) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != expectedEntry {
		return nil, false
	}
	return &malygosPhaseTwoAdd{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

// Process calls ProcessCommonActivity with the wrapper so Start and Bump
// dynamically dispatch to the phase-two add overrides below.
func (c *malygosPhaseTwoAdd) Process(m messages.Message) error {
	if cur, ok := c.Activity.Current(); ok {
		cur.HandleTimeout(m.Date())
	}
	return characters.ProcessCommonActivity(c, m)
}

func (c *malygosPhaseTwoAdd) Start(reason string, m messages.Message) {
	c.Common.Start(reason, m)
	c.bumpMalygos(m)
}

func (c *malygosPhaseTwoAdd) Bump(reason string, m messages.Message) {
	c.Common.Bump(reason, m)
	c.bumpMalygos(m)
}

func (c *malygosPhaseTwoAdd) bumpMalygos(m messages.Message) {
	for _, boss := range c.all.ByEntry[malygosEntry] {
		malygos, ok := boss.(characters.CharacterBase)
		if ok && malygos.IsActive() {
			malygos.Bump("phase two add activity", m)
		}
	}
}

func NewPowerSpark(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 30084 {
		return nil, false
	}

	// We should track this activity.
	// These sparks commit suicided to place a debuff on casters.
	return characters.NewNeverActive(id), true
}

func NewVortex(id guid.GUID, _ *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 30090 || !id.IsVehicle() {
		return nil, false
	}

	// Vortex is an encounter vehicle used during Malygos phase one. It cannot be
	// killed, so treating its combat-log activity as a hostile leaves completed
	// encounters marked partial with the Vortex remaining.
	return characters.NewNeverActive(id), true
}
