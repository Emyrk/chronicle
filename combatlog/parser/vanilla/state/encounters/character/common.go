package character

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
)

const (
	InactivityTimeout = time.Second * 60
)

type Common struct {
	*Base[*period.InactivityPeriod]
}

func NewCommonCharacter(id guid.GUID, all *Characters) *Common {
	return &Common{
		Base: NewBaseCharacter[*period.InactivityPeriod](id, all),
	}
}

func (c *Common) Process(m messages.Message) error {
	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	return processCommonActivity(c, m)
}

func (c *Common) Start(reason string, m messages.Message) {
	c.Activity.Start(period.NewInactivityPeriod(InactivityTimeout), reason, m)
}

type characterBase interface {
	Character

	Died(reason string, m messages.Message)
	Bump(reason string, m messages.Message)
	Start(reason string, m messages.Message)

	Owner() (guid.GUID, bool)
	Lookup() *Characters
	ContainsMe(ids ...guid.GUID) bool
}

// processCommonActivity handles the basics of activity processing for a character.
func processCommonActivity(c characterBase, m messages.Message) error {
	switch data := m.(type) {
	case *messages.Aura:
		if c.ID() != data.Target {
			return nil
		}

		if data.Application == types.AuraApplicationGains && data.Amount == 1 {
			switch data.SpellName {
			// Any CC style aura should start activity
			case "Polymorph", "Freezing Trap Effect", "Sap", "Hibernate":
				c.Start(fmt.Sprintf("cc_%s", data.SpellName), m)
			}
		}

	case *messages.Slain:
		if c.ID() == data.Victim {
			c.Died(ReasonSlain, m)
			return nil
		}

		// Pets are tied to their owners.
		owner, ok := c.Owner()
		if ok && owner == data.Victim {
			c.Died(ReasonOwnerSlain, m)
			return nil
		}

		// Being the killer does not indicate activity.
		// Could be killed from a dot for example.
	case *messages.Damage:
		// Damage can tick after death, so ignore if recently slain.
		if c.RecentlySlain(m) {
			return nil
		}

		target, ok := c.Lookup().Get(data.Target)
		if ok && target.RecentlySlain(m) {
			// Damaging a recently killed target is not activity
			return nil
		}

		isMe := c.ContainsMe(data.Affects()...)
		// Owner counts if we are active, and the owner is doing something.
		owner, hasOwner := c.Owner()
		ownerConditions := hasOwner && c.IsActive() && ((data.Caster != nil && owner == *data.Caster) || owner == data.Target)

		if isMe || ownerConditions {
			if data.HitType.Has(types.HitTypePeriodic) {
				// Cannot start an activity, but will bump.
				c.Bump("periodic damage", data)
				return nil
			}

			c.Start("direct damage", data)
			return nil
		}
		return nil
	}
	return nil
}

func (c *Common) Is(entry uint32) bool {
	charEntry, ok := c.ID().GetEntry()
	if !ok {
		return false
	}
	return charEntry == entry
}
