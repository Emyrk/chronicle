package characterv1

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type Totem struct {
	*Base[TotemCharacterData]
	Self totems.Totem
}

type TotemCharacterData struct {
	MaxLifeTime time.Time
}

func NewTotemCharacter(id guid.GUID, all *Characters) (Character, bool) {
	self, ok := totems.IsTotem(id)
	if !ok {
		return nil, false
	}

	return &Totem{
		Base: NewBaseCharacter[TotemCharacterData](id, all),
		Self: self,
	}, true
}

// Owner info might not yet be available.
func (c *Totem) Owner() *unitinfo.Info {
	myInfo, ok := c.Info(c.Base.ID())
	if !ok {
		return nil
	}

	if myInfo.Owner == nil {
		return nil
	}

	ownerInfo, ok := c.Info(*myInfo.Owner)
	if !ok {
		return nil
	}

	return &ownerInfo
}

// TODO: REDO PROCESS FOR TOTEMS
// - Look for "Cast" for when it comes alive to set max life
// - look for owner "recall"
// - look for owner death?
func (c *Totem) Process(m messages.Message) error {
	defer func() {
		// Timeouts should be checked on every timestamp
		c.processTimeout(m)
	}()

	switch data := m.(type) {
	case messages.Slain:
		if c.id == data.Victim {
			c.Activity.End(ReasonSlain, m)
			c.LastSlain = m
		}

		owner := c.Owner()
		if owner != nil && data.Victim == owner.Guid {
			// Owner slain, totem should end activity
			c.Activity.End(ReasonOwnerSlain, m)
			c.LastSlain = m
		}
	case messages.Heal:
		if !c.ContainsMe(data.Target, data.Caster) {
			return nil
		}

		return c.StartActivity("healing", m)
	case messages.ResourceChange:
		if data.Caster != nil && *data.Caster == c.id {
			// Mana and health spring totems
			return c.StartActivity("resource gen", m)
		}

		//12/11 12:16:19.738  CAST: 0x00000000000C270C(Noflex) casts Totemic Recall(45513).
		//12/11 12:16:19.738  0x00000000000C270C gains 44 Mana from 0x00000000000C270C's Totemic Recall.
		owner := c.Owner()
		if owner != nil &&
			data.Caster != nil &&
			*data.Caster == owner.Guid && data.Target == owner.Guid &&
			data.SpellName != nil && *data.SpellName == "Totemic Recall" {
			// Owner casted totemic recall, totem should end activity
			c.Activity.End(ReasonSlain, m)
			return nil
		}

	case messages.Damage:
		if !c.ContainsMe(data.Target, data.Caster) {
			return nil
		}

		if c.LastSlain != nil && data.Caster == c.id && data.HitType.Has(types.HitTypePeriodic) {
			// Periodic damage does not indicate life.
			return nil
		}

		return c.StartActivity("damage", m)
	}
	return nil
}

func (c *Totem) StartActivity(reason string, m messages.Message) error {
	if c.Activity.IsActive() {
		return nil
	}
	// Ignore recently slain, totems can't be revived
	if c.RecentlySlain(m) {
		return nil
	}
	const totemTimeout = time.Second * 30
	c.Activity.Bump(m)
	return c.Activity.Start(&flavoredActive[TotemCharacterData]{
		Active: Active{
			Start: &ExplainedTimestamp{
				Timestamp:   m,
				Explanation: reason,
			},
			End:          nil,
			LastActivity: m,
			NextTimeout:  m.Date().Add(totemTimeout),
			TimeoutBump:  totemTimeout,
		},
		Extra: TotemCharacterData{
			MaxLifeTime: m.Date().Add(c.Self.MaxDuration()),
		},
	})
}

func (c *Totem) processTimeout(m messages.Message) {
	if c.Activity.IsActive() && c.Activity.CurrentActivity().NextTimeout.Before(m.Date()) {
		c.Activity.End(ReasonTimeout, messages.TimedOut(c.Activity.CurrentActivity().NextTimeout))
	}

	// Totem expires after max lifetime. Grant 1 second of leeway. (latency, etc)
	maxLife := c.Activity.flavoredCurrentActivity().Extra.MaxLifeTime.Add(time.Second)
	if c.Activity.IsActive() && maxLife.Before(m.Date()) {
		c.Activity.End(ReasonTimeout, messages.TimedOut(maxLife))
	}
}
