package period

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

func (p *InactivityPeriod) CaptureState(moments func(*Moment) (string, error), message func(messages.Message) (string, error)) (State, error) {
	if p == nil || p.WorkingPeriod == nil || p.Period == nil || p.Meta == nil {
		return State{}, fmt.Errorf("incomplete inactivity period")
	}
	path, err := captureMessage(p.Meta.ResetMessage, message)
	if err != nil {
		return State{}, err
	}
	v := periodValue{Kind: "inactivity", Me: p.me, HasTimeoutPredicate: p.timeoutAsDeathIf != nil || p.trustedTimeoutOwner != nil, Timer: &timerValue{p.Meta.NextTimeout, p.Meta.BumpBy, p.Meta.PendingReset, p.Meta.ResetDeadline, p.Meta.ResetReason, path}}
	return capturePeriod(v, p.Period, moments)
}

// RestoreState only loads owned state and resolves references. The trusted
// predicate is assigned to the fresh candidate, never called or registered with
// an external owner. Hooks are attached explicitly with SetHook by composition.
func (p *InactivityPeriod) RestoreState(s State, moments func(string) (*Moment, error), message func(string) (messages.Message, error), timeoutAsDeath func() bool) error {
	if p == nil {
		return fmt.Errorf("nil inactivity period destination")
	}
	v := s.value
	if err := v.validate(); err != nil {
		return err
	}
	if v.Kind != "inactivity" {
		return fmt.Errorf("not inactivity period state")
	}
	if v.HasTimeoutPredicate != (timeoutAsDeath != nil) {
		return fmt.Errorf("timeout predicate presence mismatch")
	}
	base, err := s.restoreMoments(moments)
	if err != nil {
		return err
	}
	reset, err := resolveMessage(v.Timer.ResetMessage, message)
	if err != nil {
		return err
	}
	candidate := NewInactivityPeriod(v.Me, v.Timer.BumpBy)
	candidate.Period = base
	*candidate.Meta = InactivityTimer{NextTimeout: v.Timer.NextTimeout, BumpBy: v.Timer.BumpBy, PendingReset: v.Timer.PendingReset, ResetDeadline: v.Timer.ResetDeadline, ResetReason: v.Timer.ResetReason, ResetMessage: reset}
	candidate.timeoutAsDeathIf = timeoutAsDeath
	*p = *candidate
	return nil
}
