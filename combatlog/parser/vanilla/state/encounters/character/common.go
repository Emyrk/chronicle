package character

import (
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
}

// processCommonActivity handles the basics of activity processing for a character.
func processCommonActivity(c characterBase, m messages.Message) error {
	switch data := m.(type) {
	case messages.Slain:
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

		if data.Killer != nil && c.ID() == *data.Killer {
			// Being the killer does not indicate activity.
			// Could be killed from a dot for example.
		}
	case messages.Damage:
		// Damage can tick after death, so ignore if recently slain.
		if c.RecentlySlain(m) {
			return nil
		}

		target, ok := c.Lookup().Get(data.Target)
		if ok && target.RecentlySlain(m) {
			// Damaging a recently killed target is not activity
			return nil
		}

		owner, hasOwner := c.Owner()
		casterIsOwnerOrMe := (hasOwner && owner == data.Caster) || data.Caster == c.ID()
		targetIsOwnerOrMe := (hasOwner && owner == data.Target) || data.Target == c.ID()

		if casterIsOwnerOrMe || targetIsOwnerOrMe {
			// The caster is either my owner or me.
			if data.HitType.Has(types.HitTypePeriodic) {
				// Cannot start an activity, but will bump.
				c.Bump("periodic damage", data)
				return nil
			}

			c.Start("direct damage", data)
			return nil
		}
	}
	return nil
}
