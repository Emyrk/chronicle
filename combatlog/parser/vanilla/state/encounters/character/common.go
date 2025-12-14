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
	defer func() {
		// Timeouts should be checked on every timestamp
		cur, ok := c.Activity.Current()
		if !ok {
			return
		}
		cur.HandleTimeout(m.Date())
	}()

	switch data := m.(type) {
	case messages.Slain:
		if c.id == data.Victim {
			c.Died(ReasonSlain, m)
			return nil
		}

		// Pets are tied to their owners.
		owner, ok := c.Owner()
		if ok && owner == data.Victim {
			c.Died(ReasonOwnerSlain, m)
			return nil
		}

		if data.Killer != nil && c.id == *data.Killer {
			// Being the killer does not indicate activity.
			// Could be killed from a dot for example.
		}
	case messages.Damage:
		// Damage can tick after death, so ignore if recently slain.
		if c.RecentlySlain(m) {
			return nil
		}

		target, ok := c.Lookup.Get(data.Target)
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
				c.Activity.Bump("my periodic damage", data)
				return nil
			}

			c.Activity.Start(period.NewInactivityPeriod(InactivityTimeout), "my periodic damage", data)
			return nil
		}
	}
	return nil
}
