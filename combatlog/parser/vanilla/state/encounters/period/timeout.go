package period

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
)

// InactivityTimer tracks an inactivity-based timeout for a working period.
//
// NextTimeout is the wall-clock time at which the period should be considered
// inactive and closed if no qualifying events have occurred. BumpBy is the
// duration by which the timeout is extended when a keep-alive signal is
// observed.
type InactivityTimer struct {
	NextTimeout time.Time
	BumpBy      time.Duration
}

// InactivityPeriod wraps a WorkingPeriod with inactivity-based timeout behavior.
//
// The period is started explicitly via Begin. Once active, certain events may
// "bump" the period, extending its inactivity deadline without starting a new
// period. If the deadline is reached without a bump, the period is closed due
// to inactivity.
type InactivityPeriod struct {
	*WorkingPeriod[InactivityTimer]
}

// NewInactivityPeriod creates a new inactivity-based period with the given
// bump duration. The period is inactive until Begin is called.
func NewInactivityPeriod(bumpBy time.Duration) *InactivityPeriod {
	return &InactivityPeriod{
		WorkingPeriod: New[InactivityTimer](&InactivityTimer{
			BumpBy: bumpBy,
		}),
	}
}

func (p *InactivityPeriod) Begin(reason string, m messages.Message) {
	p.WorkingPeriod.Begin(reason, m)
	p.Meta.NextTimeout = m.Date().Add(p.Meta.BumpBy)
}

func (p *InactivityPeriod) Bump(reason string, m messages.Message) {
	if !p.IsActive() {
		return
	}

	p.Meta.NextTimeout = m.Date().Add(p.Meta.BumpBy)
	p.WorkingPeriod.Bump(reason, m)
}

// HandleTimeout closes the period if the inactivity deadline has passed. When a
// timeout occurs, the period is ended due to inactivity and LastActive is left
// unchanged.
func (p *InactivityPeriod) HandleTimeout(now time.Time) {
	if !p.IsActive() {
		return
	}

	if now.After(p.Meta.NextTimeout) {
		p.Timeout("inactivity", p.Meta.NextTimeout)
	}
}
