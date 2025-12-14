package characterv1

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type Common struct {
	*Base[CommonCharacterData]
}

type CommonCharacterData struct {
	// All common data should be in the common struct
}

func NewCommonCharacter(id guid.GUID, all *Characters) *Common {
	return &Common{
		Base: NewBaseCharacter[CommonCharacterData](id, all),
	}
}

func (c *Common) Process(m messages.Message) error {
	defer func() {
		// Timeouts should be checked on every timestamp
		c.processTimeout(m)
	}()

  c.String()
	switch data := m.(type) {
	case messages.Slain:
		if c.id == data.Victim {
			c.EndActivity(ReasonSlain, m)
			c.LastSlain = m
		}

		if data.Killer != nil && c.id == *data.Killer {
			// Being the killer does not indicate activity.
			// Could be killed from a dot for example.
		}
	case messages.Damage:
		if !c.ContainsMe(data.Target, data.Caster) {
			return nil
		}

		// Damage can tick after death, so ignore if recently slain.
		if c.RecentlySlain(m) {
			return nil
		}

		if c.LastSlain != nil && data.Caster == c.id && data.HitType.Has(types.HitTypePeriodic) {
			// Periodic damage does not indicate life.
			return nil
		}

		c.Activity.Bump(m)
		// Damage indicates activity.
		if !c.Activity.IsActive() {
			return c.StartActivity("damage", m)
		}
	}
	return nil
}
