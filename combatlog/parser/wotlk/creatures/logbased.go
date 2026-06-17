package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type LogBased struct {
	*characters.Base[*period.InactivityPeriod]
	*Unstartable
}

func NewLogBasedCharacter(id guid.GUID, all *characters.Characters) *LogBased {
	c := &LogBased{
		Base: characters.NewBaseCharacter[*period.InactivityPeriod](id, all),
	}
	c.Unstartable = &Unstartable{CharacterBase: c}
	return c
}

func (c *LogBased) Process(m messages.Message) error {
	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	switch msg := m.(type) {
	case *messages.UnitCombatEnter:
		if msg.UnitGUID == c.ID() {
			c.Start("combat enter", m)
		}
		return nil
	case *messages.UnitEvade:
		if msg.UnitGUID == c.ID() {
			c.End("evade", m, period.EndStateReset)
		}
		return nil
	case *messages.Slain:
		if c.ID() == msg.Victim {
			c.Died(characters.ReasonSlain, m)
			return nil
		}

		// Pets are tied to their owners.
		owner, ok := c.Owner()
		if ok && owner == msg.Victim {
			c.Died(characters.ReasonOwnerSlain, m)
			return nil
		}
	}

	// We want combat start to be server side defined. So only bumping should work.
	err := characters.ProcessCommonActivity(c.Unstartable, m)
	if err != nil {
		return err
	}

	return nil
}

func (c *LogBased) Start(reason string, m messages.Message) {
	c.Activity.Start(
		period.NewInactivityPeriod(c.ID(), time.Minute),
		reason, m,
	)
}

type Unstartable struct {
	characters.CharacterBase
}

func (c *Unstartable) Start(reason string, m messages.Message) {
	c.Bump(reason, m)
}
