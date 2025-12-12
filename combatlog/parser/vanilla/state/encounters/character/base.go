package character

import (
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type Base[data SpecialCharacterData] struct {
	All Characters
	id  guid.GUID
	// A character's activity periods.
	Activity *ActivePeriods[data]

	// LastSlain is the last slain message for this character.
	// If the character is revived, set this to nil.
	LastSlain messages.Message
}

func (c *Base[_]) Periods() []Active {
	periods := make([]Active, len(c.Activity.Periods))
	for i, p := range c.Activity.Periods {
		periods[i] = p.Active
	}
	return periods
}

type BaseCharacterData struct {
	// All common data should be in the common struct
}

func (c *Base[_]) ID() guid.GUID { return c.id }

func NewBaseCharacter[data SpecialCharacterData](id guid.GUID, all Characters) *Base[data] {
	me := &Base[data]{
		All: all,
		id:  id,
	}

	me.Activity = &ActivePeriods[data]{
		Periods: make([]*flavoredActive[data], 0),
		Me:      id,
		All:     all,
	}
	return me
}

func (c *Base[_]) NamedString(name string) string {
	if c == nil {
		return "<nil Character>"
	}

	id := fmt.Sprintf("ID: %s", c.ID())
	if name != "" {
		id = fmt.Sprintf("Name: %s, ID: %s", name, id)
	}

	var str strings.Builder
	str.WriteString(fmt.Sprintf("Character(%s)", id))
	if c.LastSlain != nil {
		str.WriteString(fmt.Sprintf(", LastSlain: %s", messages.ToString(c.LastSlain)))
	}
	str.WriteString("\n")
	str.WriteString(fmt.Sprintf("Activity: %s\n", c.Activity.String()))

	return str.String()
}

func (c *Base[_]) String() string {
	return c.NamedString("")
}

// RecentlySlain returns if the character was slain within the last second.
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

func (c *Base[_]) processTimeout(m messages.Message) {
	if c.Activity.IsActive() && c.Activity.CurrentActivity().NextTimeout.Before(m.Date()) {
		c.Activity.End(ReasonTimeout, messages.TimedOut(c.Activity.CurrentActivity().NextTimeout))
	}
}
