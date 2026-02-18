package character

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
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

type Totem struct {
	*Base[*TotemPeriod]
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
		Base: NewBaseCharacter[*TotemPeriod](id, all),
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

	return c.lookup.GetInfo(owner)
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
		owner, ok := c.Owner()
		if ok &&
			data.Caster != nil &&
			*data.Caster == owner && data.Target == owner &&
			data.SpellName != nil && *data.SpellName == "Totemic Recall" {
			// Owner cast totemic recall, totem should end activity
			c.Activity.End("totemic recall", m, true)
			return nil
		}
	}

	return processCommonActivity(c, m)
}

func (c *Totem) Start(reason string, m messages.Message) {
	if c.LastSlain != nil {
		return // Totems can't be revived
	}
	now := m.Date()
	// TODO: should make it specific for each totem type
	const totemTimeout = time.Second * 30

	c.Activity.Start(&TotemPeriod{
		WorkingPeriod: period.New(&TotemMeta{
			NextTimeout: now.Add(totemTimeout),
			BumpBy:      totemTimeout,
			MaxLifetime: now.Add(c.Self.MaxDuration()),
		}),
	}, reason, m)
}
