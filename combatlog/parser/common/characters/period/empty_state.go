package period

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

func (p *EmptyPeriod) CaptureState(moments func(*Moment) (string, error), _ func(messages.Message) (string, error)) (State, error) {
	if p == nil || p.WorkingPeriod == nil || p.Period == nil || p.Meta == nil {
		return State{}, fmt.Errorf("incomplete empty period")
	}
	return capturePeriod(periodValue{Kind: "empty", Me: p.me}, p.Period, moments)
}

// RestoreState loads this owner's state only. It neither invokes nor registers
// callbacks. Existing safe NewEmptyPeriod setup supplies allocation defaults;
// runtime composition attaches SetHook separately after successful restoration.
func (p *EmptyPeriod) RestoreState(s State, moments func(string) (*Moment, error)) error {
	if p == nil {
		return fmt.Errorf("nil empty period destination")
	}
	if err := s.value.validate(); err != nil {
		return err
	}
	if s.value.Kind != "empty" {
		return fmt.Errorf("not empty period state")
	}
	base, err := s.restoreMoments(moments)
	if err != nil {
		return err
	}
	candidate := NewEmptyPeriod(s.value.Me)
	candidate.Period = base
	*p = *candidate
	return nil
}
