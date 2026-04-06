package character

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
)

const (
	lightwellExpires = time.Minute
)

type LightwellMeta struct {
	NextTimeout time.Time
}

type LightwellPeriod struct {
	*period.WorkingPeriod[LightwellMeta]
}

func (t *LightwellPeriod) Begin(reason string, m messages.Message) {
	t.WorkingPeriod.Begin(reason, m)
	t.Meta.NextTimeout = m.Date().Add(lightwellExpires)
}

func (t *LightwellPeriod) Bump(reason string, m messages.Message) {
	if !t.IsActive() {
		return
	}
	t.WorkingPeriod.Bump(reason, m)
}

func (t *LightwellPeriod) HandleTimeout(now time.Time) {
	if !t.IsActive() {
		return
	}

	if now.After(t.Meta.NextTimeout) {
		t.End("expired", messages.TimedOut(now), period.EndStateSlain)
		t.Timeout("inactivity", t.Meta.NextTimeout)
	}
}

// EnterResetGracePeriod is a no-op for lightwell - they don't support reset grace periods.
func (t *LightwellPeriod) EnterResetGracePeriod(_ string, _ messages.Message) {
}

type Lightwell struct {
	*Base[*LightwellPeriod]
}

func NewLightwell(id guid.GUID, all *Characters) (Character, bool) {
	if entry, ok := id.GetEntry(); ok && entry == 181102 {
		return &Lightwell{
			Base: NewBaseCharacter[*LightwellPeriod](id, all),
		}, true
	}
	return nil, false
}

// TODO: REDO PROCESS FOR TOTEMS
// - Look for "Cast" for when it comes alive to set max life
// - look for owner "recall"
// - look for owner death?
func (c *Lightwell) Process(m messages.Message) error {
	if c.LastSlain != nil {
		return nil // Totems can't be revived
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
	}

	return nil
}

func (c *Lightwell) Start(reason string, m messages.Message) {
	if c.LastSlain != nil {
		return // Totems can't be revived
	}

	c.Activity.Start(&LightwellPeriod{
		WorkingPeriod: period.New(c.ID(), &LightwellMeta{
			NextTimeout: m.Date().Add(lightwellExpires),
		}),
	}, reason, m)
}
