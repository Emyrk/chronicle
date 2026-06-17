package period

import (
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

var _ IsPeriod = (*InactivityPeriod)(nil)

// ResetGracePeriod is the duration to wait after CC fades before marking
// a period as reset. If activity occurs within this window, the reset is cancelled.
const ResetGracePeriod = 5 * time.Second

// InactivityTimer tracks an inactivity-based timeout for a working period.
//
// NextTimeout is the wall-clock time at which the period should be considered
// inactive and closed if no qualifying events have occurred. BumpBy is the
// duration by which the timeout is extended when a keep-alive signal is
// observed.
type InactivityTimer struct {
	NextTimeout time.Time
	BumpBy      time.Duration

	// Grace period for pending reset (e.g., CC faded)
	PendingReset  bool
	ResetDeadline time.Time
	ResetReason   string
	ResetMessage  messages.Message
}

// InactivityPeriod wraps a WorkingPeriod with inactivity-based timeout behavior.
//
// The period is started explicitly via Begin. Once active, certain events may
// "bump" the period, extending its inactivity deadline without starting a new
// period. If the deadline is reached without a bump, the period is closed due
// to inactivity.
type InactivityPeriod struct {
	*WorkingPeriod[InactivityTimer]

	timeoutAsDeath bool
}

// NewInactivityPeriod creates a new inactivity-based period with the given
// bump duration. The period is inactive until Begin is called.
func NewInactivityPeriod(me guid.GUID, bumpBy time.Duration) *InactivityPeriod {
	return &InactivityPeriod{
		WorkingPeriod: New[InactivityTimer](me, &InactivityTimer{
			BumpBy: bumpBy,
		}),
	}
}

func (p *InactivityPeriod) WithTimeoutAsDeath(set bool) *InactivityPeriod {
	p.timeoutAsDeath = set
	return p
}

func (p *InactivityPeriod) Begin(reason string, m messages.Message) {
	p.CancelResetGracePeriod() // New activity cancels pending reset
	p.WorkingPeriod.Begin(reason, m)
	p.Meta.NextTimeout = m.Date().Add(p.Meta.BumpBy)
}

func (p *InactivityPeriod) Bump(reason string, m messages.Message) {
	if !p.IsActive() {
		return
	}

	p.CancelResetGracePeriod() // Activity cancels pending reset
	p.Meta.NextTimeout = m.Date().Add(p.Meta.BumpBy)
	p.WorkingPeriod.Bump(reason, m)
}

// EnterResetGracePeriod puts the period into a pending reset state.
// If no activity occurs before the deadline, the period ends with EndStateReset.
func (p *InactivityPeriod) EnterResetGracePeriod(reason string, m messages.Message) {
	if !p.IsActive() {
		return
	}
	p.Meta.PendingReset = true
	p.Meta.ResetDeadline = m.Date().Add(ResetGracePeriod)
	p.Meta.ResetReason = reason
	p.Meta.ResetMessage = m
}

// CancelResetGracePeriod clears the pending reset state (called on activity).
func (p *InactivityPeriod) CancelResetGracePeriod() {
	p.Meta.PendingReset = false
	p.Meta.ResetMessage = nil
}

// HandleTimeout closes the period if the inactivity deadline has passed. When a
// timeout occurs, the period is ended due to inactivity and LastActive is left
// unchanged.
func (p *InactivityPeriod) HandleTimeout(now time.Time) bool {
	if !p.IsActive() {
		return false
	}

	// Check pending reset grace period first
	if p.Meta.PendingReset && now.After(p.Meta.ResetDeadline) {
		reason := "reset"
		if isAura, ok := p.Meta.ResetMessage.(*messages.Aura); ok {
			reason += ": " + isAura.SpellName
		}
		p.ResetTimeout(reason, now)
		return true
	}

	// Normal inactivity timeout
	if now.After(p.Meta.NextTimeout) {
		p.Timeout("inactivity", p.Meta.NextTimeout)
		if p.timeoutAsDeath {
			p.EndState = EndStateSlain
		} else if strings.HasPrefix(p.LastActive.Reason, "cc_") {
			p.EndState = EndStateReset
		}
		return true
	}
	return false
}
