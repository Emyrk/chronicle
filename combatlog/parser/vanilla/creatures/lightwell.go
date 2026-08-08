package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/traps"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type ObjectMeta struct {
	NextTimeout time.Time
}

type ObjectPeriod struct {
	*period.WorkingPeriod[ObjectMeta]
	MaxLifetime time.Duration
}

func (t *ObjectPeriod) Begin(reason string, m messages.Message) {
	t.WorkingPeriod.Begin(reason, m)
	t.Meta.NextTimeout = m.Date().Add(t.MaxLifetime)
}

func (t *ObjectPeriod) Bump(reason string, m messages.Message) {
	if !t.IsActive() {
		return
	}
	t.WorkingPeriod.Bump(reason, m)
}

func (t *ObjectPeriod) HandleTimeout(now time.Time) {
	if !t.IsActive() {
		return
	}

	if now.After(t.Meta.NextTimeout) {
		t.End("expired", messages.TimedOut(now), period.EndStateSlain)
		t.Timeout("inactivity", t.Meta.NextTimeout)
	}
}

// EnterResetGracePeriod is a no-op for objects - they don't support reset grace periods.
func (t *ObjectPeriod) EnterResetGracePeriod(_ string, _ messages.Message) {
}

type Object struct {
	*characters.Base[*ObjectPeriod]
	MaxLifetime time.Duration
}

func NewObject(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if !id.IsObject() {
		return nil, false
	}

	entry, ok := id.GetEntry()
	if !ok {
		return nil, false
	}

	_, isTrap := traps.IsTrap(id)

	switch {
	case entry == 181102:
		return &Object{
			Base:        characters.NewBaseCharacter[*ObjectPeriod](id, all),
			MaxLifetime: time.Minute,
		}, true
	case isTrap:
		return &Object{
			Base:        characters.NewBaseCharacter[*ObjectPeriod](id, all),
			MaxLifetime: time.Second * 5,
		}, true
	}

	return nil, false
}

func (c *Object) Process(m messages.Message) error {
	if c.LastSlain != nil {
		return nil // Objects can't be revived
	}

	// Timeouts should be checked on every timestamp
	cur, ok := c.Activity.Current()
	if ok {
		cur.HandleTimeout(m.Date())
	}

	switch data := m.(type) {
	case *messages.Heal:
		if data.Caster == c.ID() {
			c.Start("heal cast", m)
		}
	case *messages.Damage:
		if data.Caster != nil && *data.Caster == c.ID() {
			c.Start("damage cast", m)
		}
	case *messages.AuraCast:
		if data.Caster == c.ID() {
			c.Start("aura cast", m)
		}
	}

	return nil
}

func (c *Object) Start(reason string, m messages.Message) {
	if c.LastSlain != nil {
		return
	}

	c.Activity.Start(&ObjectPeriod{
		WorkingPeriod: period.New(c.ID(), &ObjectMeta{
			NextTimeout: m.Date().Add(c.MaxLifetime),
		}),
		MaxLifetime: c.MaxLifetime,
	}, reason, m)
}
