package character

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
)

// Some common reasons

const (
	ReasonTimeout    = "timeout"
	ReasonSlain      = "slain"
	ReasonOwnerSlain = "owner_slain"
)

type Character interface {
	ID() guid.GUID
	String() string
	Process(m messages.Message) error
	Periods() []period.Period
	RecentlySlain(m messages.Message) bool
}

type Base[M period.IsPeriod] struct {
	Lookup *Characters
	id     guid.GUID

	// Activity is the append-only history of activity periods for this character.
	Activity period.PeriodCollector[M]

	// LastSlain is the last slain message for this character.
	LastSlain messages.Message
}

func NewBaseCharacter[M period.IsPeriod](me guid.GUID, lookup *Characters) *Base[M] {
	return &Base[M]{Lookup: lookup, id: me}
}

func (c *Base[_]) ID() guid.GUID { return c.id }

func (c *Base[_]) RecentlySlain(m messages.Message) bool {
	if c.LastSlain == nil {
		return false
	}
	return m.Date().Sub(c.LastSlain.Date()) < time.Second
}

func (c *Base[_]) ContainsMe(ids ...guid.GUID) bool {
	for _, id := range ids {
		if c.id == id {
			return true
		}
	}
	return false
}

func (c *Base[_]) Periods() []period.Period {
	periods := make([]period.Period, len(c.Activity.History))
	for i, p := range c.Activity.History {
		periods[i] = p.Get()
	}
	return periods
}

func (c *Base[_]) Died(reason string, m messages.Message) {
	c.Activity.End(reason, m)
	c.LastSlain = m
}

func (c *Base[_]) Info() (unitinfo.Info, bool) {
	return c.Lookup.db.Get(c.ID())
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
