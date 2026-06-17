package characters

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type PermanentDeath struct {
	CharacterBase
	dead bool
}

func NewPermanentDeath(c CharacterBase) *PermanentDeath {
	return &PermanentDeath{
		CharacterBase: c,
	}
}

func (c *PermanentDeath) Process(m messages.Message) error {
	if c.dead {
		return nil
	}

	err := c.CharacterBase.Process(m)
	if err != nil {
		return err
	}

	if p, ok := c.CurrentPeriod(); ok && p.EndState == period.EndStateSlain {
		c.dead = true
	}

	return nil
}
