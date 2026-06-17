package creatures

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type TotemMeta struct {
	NextTimeout time.Time
	BumpBy      time.Duration
	MaxLifetime time.Time
}

type TotemPeriod struct {
	*period.WorkingPeriod[TotemMeta]
}

func (t *TotemPeriod) Begin(reason string, m messages.Message) {
	t.WorkingPeriod.Begin(reason, m)
	t.Meta.NextTimeout = m.Date().Add(t.Meta.BumpBy)
}

func (t *TotemPeriod) Bump(reason string, m messages.Message) {
	if !t.IsActive() {
		return
	}
	t.Meta.NextTimeout = m.Date().Add(t.Meta.BumpBy)
	t.WorkingPeriod.Bump(reason, m)
}

// HandleTimeout closes the period if the inactivity deadline has passed. When a
// timeout occurs, the period is ended due to inactivity and LastActive is left
// unchanged.
func (t *TotemPeriod) HandleTimeout(now time.Time) {
	if !t.IsActive() {
		return
	}

	if now.After(t.Meta.NextTimeout) {
		t.Timeout("inactivity", t.Meta.NextTimeout)
	}

	if now.After(t.Meta.MaxLifetime) {
		t.Timeout("expired, max_lifetime", t.Meta.MaxLifetime)
	}
}

// EnterResetGracePeriod is a no-op for totems - they don't support reset grace periods.
func (t *TotemPeriod) EnterResetGracePeriod(reason string, m messages.Message) {
	// Totems don't get CC'd and don't need reset grace periods
}

type Totem struct {
	*characters.Base[*TotemPeriod]
	Self totems.Totem
}

type TotemCharacterData struct {
	MaxLifeTime time.Time
}

func NewTotemCharacter(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	self, ok := totems.IsTotem(id)
	if !ok {
		return nil, false
	}

	return &Totem{
		Base: characters.NewBaseCharacter[*TotemPeriod](id, all),
		Self: self,
	}, true
}

// Owner info might not yet be available.
func (c *Totem) OwnerInfo() (unitinfo.Info, bool) {
	myInfo, ok := c.Info()
	if !ok {
		return unitinfo.Info{}, false
	}

	if myInfo.Owner == nil {
		return unitinfo.Info{}, false
	}

	owner, ok := c.Owner()
	if !ok {
		return unitinfo.Info{}, false
	}

	return c.Lookup().GetInfo(owner)
}

// TODO: REDO PROCESS FOR TOTEMS
// - Look for "Cast" for when it comes alive to set max life
// - look for owner "recall"
// - look for owner death?
func (c *Totem) Process(m messages.Message) error {
	if c.LastSlain != nil {
		return nil // Totems can't be revived
	}

	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	if c.LastSlain != nil {
		return nil // Totems can't be revived
	}

	switch data := m.(type) {
	case *messages.Heal:
		if data.Caster == c.ID() {
			if c.IsActive() {
				c.Bump("healed", m)
				return nil
			} else {
				tc, ok := c.Lookup().Get(data.Target)
				if ok && tc.IsActive() {
					c.Start("healed active", m)
					return nil
				}
			}
		}
	case *messages.Dispel:
		if data.Caster == c.ID() && data.Spell != nil {
			c.Start(fmt.Sprintf("dispelled %s", data.Spell.Name()), m)
			return nil
		}
	case *messages.ResourceChange:
		// Mana and health spring totems helping an active target
		if data.Caster != nil && *data.Caster == c.ID() {
			targetChar, ok := c.Lookup().Get(data.Target)
			if ok && targetChar.IsActive() {
				c.Start("resource gen to active target", m)
				return nil
			}
		}

		//12/11 12:16:19.738  CAST: 0x00000000000C270C(Noflex) casts Totemic Recall(45513).
		//12/11 12:16:19.738  0x00000000000C270C gains 44 Mana from 0x00000000000C270C's Totemic Recall.
		if data.SpellData != nil && data.SpellData.ID == 45513 {
			c.TotemicRecall(m, data.Caster, &data.Target)
			return nil
		}
	case *messages.SpellGo:
		if data.SpellData == nil {
			break
		}

		if data.SpellData.ID == 45513 {
			c.TotemicRecall(m, &data.Caster, data.Target)
			return nil
		}

		if data.Caster == c.ID() {
			if c.IsActive() {
				c.Bump("cast", m)
				return nil
			} else if data.Target != nil {
				tc, ok := c.Lookup().Get(*data.Target)
				if ok && tc.IsActive() {
					// If the totem is cast on an active target, it should be active too.
					// Think tremor and clense totems
					c.Start("cast on active target", m)
					return nil
				}
			}
			return nil
		}

	}

	return characters.ProcessCommonActivity(c, m)
}

func (c *Totem) TotemicRecall(m messages.Message, caster *guid.GUID, target *guid.GUID) {
	owner, ok := c.Owner()
	if !ok {
		return
	}

	if caster == nil {
		return
	}

	if target == nil {
		return
	}

	if *caster == owner && *target == owner {
		c.Activity.End("totemic recall", m, period.EndStateSlain)
	}
}

func (c *Totem) Start(reason string, m messages.Message) {
	if c.LastSlain != nil {
		return // Totems can't be revived
	}
	now := m.Date()
	// TODO: should make it specific for each totem type
	const totemTimeout = time.Second * 30

	c.Activity.Start(&TotemPeriod{
		WorkingPeriod: period.New(c.ID(), &TotemMeta{
			NextTimeout: now.Add(totemTimeout),
			BumpBy:      totemTimeout,
			MaxLifetime: now.Add(c.Self.MaxDuration()),
		}),
	}, reason, m)
}
