package period

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

type IsPeriod interface {
	Begin(reason string, ts messages.Message)
	Close(reason string, ts messages.Message)
	Timeout(reason string, date time.Time)
	Bump(reason string, ts messages.Message)
	IsActive() bool
	Get() Period
	String() string
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
	Start      *Moment
	End        *Moment
	LastActive *Moment
}

type Moment struct {
	Timestamp messages.Message
	// Reason is a human-readable string describing why this moment was recorded.
	// This should never be used programmatically.
	Reason string
}

type PeriodMeta interface {
}

// WorkingPeriod allows storing metadata alongside a Period for enhanced context
// and detection.
type WorkingPeriod[M PeriodMeta] struct {
	*Period
	Meta *M
}

func New[M PeriodMeta](meta *M) *WorkingPeriod[M] {
	return &WorkingPeriod[M]{
		Period: &Period{},
		Meta:   meta,
	}
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
	p.Start = m
}

func (p *WorkingPeriod[M]) Close(reason string, ts messages.Message) {
	m := &Moment{
		Timestamp: ts,
		Reason:    reason,
	}
	defer func() {
		// Always bump the last active time on close
		p.Bump(reason, ts)
	}()

	if !p.IsActive() {
		return
	}
	p.End = m
}

// Timeout does not bump the last active time, as it does not indicate activity.
func (p *WorkingPeriod[M]) Timeout(reason string, date time.Time) {
	if !p.IsActive() {
		return
	}
	p.End = &Moment{
		Timestamp: messages.TimedOut(date),
		Reason:    fmt.Sprintf("Timeout: %s", reason),
	}
}

// Bump advances LastActive without starting a new period.
// Used for weak signals that extend an existing period.
func (p *WorkingPeriod[M]) Bump(reason string, ts messages.Message) {
	if !p.IsActive() {
		return
	}
	p.LastActive = &Moment{
		Timestamp: ts,
		Reason:    reason,
	}
}

func (p *WorkingPeriod[M]) IsActive() bool {
	return p.Start != nil && p.End == nil
}

func (p *WorkingPeriod[M]) String() string {
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
