package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	orgrimsHammerEntry        uint32 = 37215
	valithriaDreamwalkerEntry uint32 = 36789
	dreamwalkersRageSpellID          = chrondbc.SpellID(71189)
)

// NewGunshipBattleCharacter treats the enemy gunship's positive-overkill hit
// as its scripted defeat. WotLK client logs do not emit UNIT_DIED for the ship.
func NewGunshipBattleCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != orgrimsHammerEntry {
		return nil, false
	}

	common := characters.NewCommonCharacter(id, all)
	return characters.NewScriptedDefeatCharacter(id, common, characters.ScriptedDefeatConfig{
		PositiveOverkill: true,
	}), true
}

type valithriaDreamwalkerCharacter struct {
	*characters.Common
}

// NewValithriaDreamwalker marks Dreamwalker's Rage as the scripted encounter
// victory. Valithria survives the encounter, so no death event is logged.
func NewValithriaDreamwalker(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	entry, ok := id.GetEntry()
	if !ok || entry != valithriaDreamwalkerEntry {
		return nil, false
	}

	return &valithriaDreamwalkerCharacter{
		Common: characters.NewCommonCharacter(id, all),
	}, true
}

func (c *valithriaDreamwalkerCharacter) Process(m messages.Message) error {
	cast, ok := m.(*messages.SpellStart)
	if ok && cast.Caster == c.ID() && cast.SpellID == dreamwalkersRageSpellID {
		c.Died("valithria_dreamwalkers_rage", m)
		return nil
	}

	return c.Common.Process(m)
}
