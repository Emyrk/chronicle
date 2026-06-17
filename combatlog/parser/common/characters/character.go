package characters

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// Some common reasons

const (
	ReasonTimeout    = "timeout"
	ReasonSlain      = "slain"
	ReasonOwnerSlain = "owner_slain"
)

type Hook interface {
}

// TODO: Slim the interface for external use
type Character interface {
	ID() guid.GUID
	String() string
	Died(reason string, m messages.Message)
	Process(m messages.Message) error
	Periods() []period.Period
	RecentlySlain(m messages.Message) bool
	IsActive() bool
	CurrentPeriod() (period.Period, bool)
	SetPeriodHook(hook period.Hook)
}

type Base[M period.IsPeriod] struct {
	lookup *Characters
	id     guid.GUID

	// Activity is the append-only history of activity periods for this character.
	Activity period.PeriodCollector[M]

	// LastSlain is the last slain message for this character.
	LastSlain     messages.Message
	recentlySlain time.Duration
}

func NewBaseCharacter[M period.IsPeriod](me guid.GUID, lookup *Characters) *Base[M] {
	return &Base[M]{lookup: lookup, id: me, recentlySlain: time.Second * 3}
}

func (c *Base[_]) SetPeriodHook(hook period.Hook) {
	c.Activity.WithHook(hook)
}

func (c *Base[_]) SetRecentlySlainDuration(d time.Duration) {
	c.recentlySlain = d
}

func (c *Base[_]) ID() guid.GUID { return c.id }

func (c *Base[_]) RecentlySlain(m messages.Message) bool {
	if c.LastSlain == nil {
		return false
	}
	return m.Date().Sub(c.LastSlain.Date()) < c.recentlySlain
}

func (c *Base[_]) ContainsMe(ids ...guid.GUID) bool {
	for _, id := range ids {
		if c.id == id {
			return true
		}
	}
	return false
}

func (c *Base[_]) CurrentPeriod() (period.Period, bool) {
	cur, ok := c.Activity.Current()
	if !ok {
		return period.Period{}, false
	}
	return cur.Get(), true
}

func (c *Base[M]) CurrentPeriodIsPeriod() (period.IsPeriod, bool) {
	return c.Activity.Current()
}

func (c *Base[_]) IsActive() bool {
	return c.Activity.IsActive()
}

func (c *Base[_]) NumberOfPeriods() int {
	return len(c.Activity.History)
}

func (c *Base[_]) Periods() []period.Period {
	periods := make([]period.Period, len(c.Activity.History))
	for i, p := range c.Activity.History {
		periods[i] = p.Get()
	}
	return periods
}

func (c *Base[_]) Died(reason string, m messages.Message) {
	c.Activity.End(reason, m, period.EndStateSlain)
	c.LastSlain = m
}

func (c *Base[_]) End(reason string, m messages.Message, state period.EndState) {
	c.Activity.End(reason, m, state)
}

func (c *Base[_]) Bump(reason string, m messages.Message) {
	cur, ok := c.Activity.Current()
	if !ok {
		return
	}
	cur.Bump(reason, m)
}

func (c *Base[_]) Info() (unitinfo.Info, bool) {
	return c.lookup.db.Get(c.ID())
}

func (c *Base[_]) Owner() (guid.GUID, bool) {
	myInfo, ok := c.Info()
	if !ok {
		return 0, false
	}
	if myInfo.Owner == nil {
		return 0, false
	}
	return *myInfo.Owner, true
}

func (c *Base[M]) Lookup() *Characters {
	return c.lookup
}

func (c *Base[_]) String() string {
	if c == nil {
		return "<nil Character>"
	}

	id := fmt.Sprintf("ID: %s", c.ID())

	var str strings.Builder
	str.WriteString(fmt.Sprintf("Character(%s)", id))
	if c.LastSlain != nil {
		str.WriteString(fmt.Sprintf(", LastSlain: %s", messages.ToString(c.LastSlain)))
	}
	str.WriteString("\n")
	str.WriteString(fmt.Sprintf("Activity: %s\n", c.Activity.String()))

	return str.String()
}
