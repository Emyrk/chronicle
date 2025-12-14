package characterv1

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type CharacterPeriodData interface {
}

type ActivePeriods[special CharacterPeriodData] struct {
	Periods []*flavoredActive[special]

	// Reference to the parent's state
	Me  guid.GUID
	All *Characters
}

func (ap *ActivePeriods[_]) CurrentActivity() *Active {
	if len(ap.Periods) == 0 {
		return nil
	}
	return &(ap.Periods[len(ap.Periods)-1].Active)
}

func (ap *ActivePeriods[special]) flavoredCurrentActivity() *flavoredActive[special] {
	if len(ap.Periods) == 0 {
		return nil
	}
	return ap.Periods[len(ap.Periods)-1]
}

func (ap *ActivePeriods[SpecialCharacterData]) String() string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("%d Periods", len(ap.Periods)))
	str.WriteString(fmt.Sprintf(", Active=%t", ap.IsActive()))
	if ap.CurrentActivity().LastActivity != nil {
		str.WriteString(fmt.Sprintf(", LatAct=%s", messages.ToString(ap.CurrentActivity().LastActivity)))
	}

	str.WriteString("\n")
	for _, p := range ap.Periods {
		str.WriteString(fmt.Sprintf("  %s\n", p.String()))
	}

	return str.String()
}

func (ap *ActivePeriods[SpecialCharacterData]) Bump(m messages.Message) {
	if ap.IsActive() {
		ap.CurrentActivity().Bump(m)
	}
}

func (ap *ActivePeriods[SpecialCharacterData]) End(reason string, m messages.Message) {
	if len(ap.Periods) == 0 {
		return
	}
	ap.Periods[len(ap.Periods)-1].End = &ExplainedTimestamp{
		Timestamp:   m,
		Explanation: reason,
	}
}

func (ap *ActivePeriods[SpecialCharacterData]) Start(act *flavoredActive[SpecialCharacterData]) error {
	if ap.IsActive() {
		return errors.New("life already active")
	}

	ap.Periods = append(ap.Periods, act)
	return nil
}

// IsActive returns if the unit is currently known to be alive.
func (ap *ActivePeriods[any]) IsActive() bool {
	act := ap.CurrentActivity()
	return act != nil && act.End == nil
}

func (ap *ActivePeriods[any]) LastInactive() (string, messages.Message) {
	if len(ap.Periods) == 0 {
		return "", nil
	}
	last := ap.Periods[len(ap.Periods)-1]
	if last.End == nil {
		return "", nil
	}
	return last.End.Explanation, last.End.Timestamp
}

type Active struct {
	Start *ExplainedTimestamp
	End   *ExplainedTimestamp

	LastActivity messages.Message
	NextTimeout  time.Time
	TimeoutBump  time.Duration
}

type flavoredActive[special CharacterPeriodData] struct {
	Active

	//// MaxLifetime if set defines the timestamp in which the character will cease to
	//// exist. Totems are an example of this.
	//MaxLifetime time.Time

	Extra special
}

func (a *Active) Bump(m messages.Message) {
	a.LastActivity = m
	a.NextTimeout = m.Date().Add(a.TimeoutBump)
}

func (a Active) String() string {
	if a.Start == nil && a.End == nil {
		return "Inactive(Start:<nil>, End:<nil>)"
	}

	if a.End == nil {
		return fmt.Sprintf("Active(Start: %s, End: <nil>)", a.Start)
	}

	return fmt.Sprintf("Inactive(Start: %s, End: %s)", a.Start, a.End)
}

type ExplainedTimestamp struct {
	Timestamp   messages.Message
	Explanation string
}

func (et ExplainedTimestamp) String() string {
	return fmt.Sprintf("%s (Reason: %s)", messages.ToString(et.Timestamp), et.Explanation)
}
