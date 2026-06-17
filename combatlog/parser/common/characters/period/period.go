package period

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

type IsPeriod interface {
	Begin(reason string, ts messages.Message)
	End(reason string, ts messages.Message, endState EndState)
	Timeout(reason string, date time.Time)
	Bump(reason string, ts messages.Message)
	EnterResetGracePeriod(reason string, m messages.Message)
	IsActive() bool
	Get() Period
	String() string
	SetHook(Hook)
}

// EndState describes how an activity period ended
type EndState string

const (
	EndStateNone    EndState = ""        // Period still active (no end)
	EndStateSlain   EndState = "slain"   // Unit was killed
	EndStateReset   EndState = "reset"   // Unit left combat without dying
	EndStateTimeout EndState = "timeout" // Inactivity timeout
)

func PeriodsDuring(periods []Period, start, end time.Time) ([]Period, error) {
	// Minor buffer allowed
	start = start.Add(-1 * time.Millisecond)
	end = end.Add(1 * time.Millisecond)

	var result []Period
	for _, p := range periods {
		if p.Start == nil || p.End == nil {
			return nil, fmt.Errorf("invalid period with nil start and/or end")
		}

		pStart := p.Start.Timestamp.Date()
		pEnd := p.End.Timestamp.Date()

		if pStart.After(start) && pEnd.Before(end) {
			result = append(result, p)
		}
	}
	return result, nil
}

// Period represents a contiguous span of time within an encounter during which
// some meaningful activity is considered to be occurring.
//
// A Period is defined by a Start and End moment. While the period is open,
// LastActive tracks the most recent moment that contributed to keeping the
// period alive. Not every observed moment is strong enough to start a new
// period, but some moments may extend an existing one; such moments advance
// LastActive without affecting Start.
//
// If a period ends due to inactivity (for example, a timeout), End will reflect
// the moment at which the period was closed, while LastActive will remain set to
// the final moment of actual activity and may therefore differ from End.
type Period struct {
	Start      *Moment  `json:"start"`
	End        *Moment  `json:"end"`
	LastActive *Moment  `json:"last_active"`
	EndState   EndState `json:"end_state,omitempty"`
}

func (p Period) Compare(other Period) int {
	if p.Start == nil && other.Start == nil {
		return 0
	}

	if p.Start == nil && other.Start != nil {
		return -1
	}

	if p.Start != nil && other.Start == nil {
		return 1
	}

	return p.Start.Timestamp.Date().Compare(other.Start.Timestamp.Date())
}

func (p Period) IsActive() bool {
	return p.Start != nil && p.End == nil
}

type Moment struct {
	Timestamp messages.Message `json:"timestamp"`
	// Reason is a human-readable string describing why this moment was recorded.
	// This should never be used programmatically.
	Reason string `json:"reason"`
}

type PeriodMeta interface {
}

// WorkingPeriod allows storing metadata alongside a Period for enhanced context
// and detection.
type WorkingPeriod[M PeriodMeta] struct {
	*Period
	me   guid.GUID
	Meta *M
	hook Hook
}

func New[M PeriodMeta](me guid.GUID, meta *M) *WorkingPeriod[M] {
	return &WorkingPeriod[M]{
		Period: &Period{},
		Meta:   meta,
		me:     me,
	}
}

func (p *WorkingPeriod[M]) SetHook(hook Hook) {
	p.hook = hook
}

func (p *WorkingPeriod[M]) Get() Period {
	return *p.Period
}

func (p *WorkingPeriod[M]) Begin(reason string, ts messages.Message) {
	m := &Moment{
		Timestamp: ts,
		Reason:    reason,
	}
	defer func() {
		// Always bump the last active time on begin
		p.Bump(reason, ts)
	}()

	if p.IsActive() {
		return
	}
	if p.hook != nil {
		p.hook.OnActivityChange(ts)
	}

	ts.AddActivity(p.me, messages.ActivityStart)
	p.Start = m
}

func (p *WorkingPeriod[M]) End(reason string, ts messages.Message, endState EndState) {
	m := &Moment{
		Timestamp: ts,
		Reason:    reason,
	}
	defer func() {
		// Always bump the last active time on end
		p.Bump(reason, ts)
	}()

	if !p.IsActive() {
		return
	}
	if p.hook != nil {
		p.hook.OnActivityChange(ts)
	}

	p.Period.End = m
	p.EndState = endState

	// Add activity event based on end state
	switch endState {
	case EndStateSlain:
		ts.AddActivity(p.me, messages.ActivitySlain)
	default:
		ts.AddActivity(p.me, messages.ActivityEnd)
	}
}

// ResetTimeout is a timeout from a reset grace period.
func (p *WorkingPeriod[M]) ResetTimeout(reason string, date time.Time) {
	if !p.IsActive() {
		return
	}
	if p.hook != nil {
		p.hook.OnActivityChange(messages.TimedOut(date))
	}
	p.Period.End = &Moment{
		Timestamp: messages.TimedOut(date),
		Reason:    fmt.Sprintf("Reset: %s", reason),
	}
	p.EndState = EndStateReset
}

// Timeout does not bump the last active time, as it does not indicate activity.
func (p *WorkingPeriod[M]) Timeout(reason string, date time.Time) {
	if !p.IsActive() {
		return
	}
	if p.hook != nil {
		p.hook.OnActivityChange(messages.TimedOut(date))
	}

	p.Period.End = &Moment{
		Timestamp: messages.TimedOut(date),
		Reason:    fmt.Sprintf("Timeout: %s", reason),
	}
	p.EndState = EndStateTimeout
}

// Bump advances LastActive without starting a new period.
// Used for weak signals that extend an existing period.
func (p *WorkingPeriod[M]) Bump(reason string, ts messages.Message) {
	if !p.IsActive() {
		return
	}
	ts.AddActivity(p.me, messages.ActivityBump)
	p.LastActive = &Moment{
		Timestamp: ts,
		Reason:    reason,
	}
}

func (p Period) String() string {
	if p.Start == nil && p.End == nil {
		return "Inactive(Start:<nil>, End:<nil>)"
	}

	if p.End == nil {
		return fmt.Sprintf("Active(Start: %s, End: <nil>)", p.Start)
	}

	return fmt.Sprintf("Inactive(Start: %s, End: %s)", p.Start, p.End)
}

func (m Moment) String() string {
	return fmt.Sprintf("%s (Reason: %s)", messages.ToString(m.Timestamp), m.Reason)
}
