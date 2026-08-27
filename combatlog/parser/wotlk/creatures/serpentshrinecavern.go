package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const (
	theLurkerBelowEntry   = 21217
	coilfangGuardianEntry = 21873
)

type coilfangGuardian struct {
	*characters.Common
	all *characters.Characters
}

func NewCoilfangGuardian(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != coilfangGuardianEntry {
		return nil, false
	}

	return &coilfangGuardian{
		Common: characters.NewCommonCharacter(id, all),
		all:    all,
	}, true
}

func (c *coilfangGuardian) Process(m messages.Message) error {
	if current, ok := c.Activity.Current(); ok {
		current.HandleTimeout(m.Date())
	}
	return characters.ProcessCommonActivity(c, m)
}

func (c *coilfangGuardian) Start(reason string, m messages.Message) {
	c.Common.Start(reason, m)
	c.bumpLurker(m)
}

func (c *coilfangGuardian) Bump(reason string, m messages.Message) {
	c.Common.Bump(reason, m)
	c.bumpLurker(m)
}

func (c *coilfangGuardian) bumpLurker(m messages.Message) {
	for _, lurker := range c.all.ByEntry[theLurkerBelowEntry] {
		boss, ok := lurker.(characters.CharacterBase)
		if ok && boss.IsActive() {
			boss.Bump("coilfang_guardian_activity", m)
		}
	}
}
