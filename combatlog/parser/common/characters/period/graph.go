package period

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

func RegisterGraphOwners(r *ownergraph.Registry) error {
	if e := ownergraph.Register(r, ownergraph.Codec[Moment]{Type: MomentStateType, Version: MomentStateVersion, Init: func() *Moment { return new(Moment) }, Capture: func(m *Moment, c *ownergraph.Capture) ([]byte, error) {
		s, e := CaptureMoment(m, ownergraph.Reference[messages.Message](c))
		if e != nil {
			return nil, e
		}
		return s.Encode()
	}, Restore: func(m *Moment, v uint32, b []byte, c *ownergraph.Restore) error {
		s, e := DecodeMomentState(v, b)
		if e != nil {
			return e
		}
		fresh, e := s.Restore(ownergraph.Loader[messages.Message](c))
		if e != nil {
			return e
		}
		*m = *fresh
		return nil
	}}); e != nil {
		return e
	}
	if e := ownergraph.Register(r, ownergraph.Codec[InactivityPeriod]{Type: StateType + ".Inactivity", Version: StateVersion, Init: func() *InactivityPeriod { return new(InactivityPeriod) }, Capture: func(p *InactivityPeriod, c *ownergraph.Capture) ([]byte, error) {
		s, e := p.CaptureState(ownergraph.Reference[*Moment](c), ownergraph.Reference[messages.Message](c))
		if e != nil {
			return nil, e
		}
		if s.value.HasTimeoutPredicate {
			return nil, fmt.Errorf("period callback requires trusted graph adapter")
		}
		return s.Encode()
	}, Restore: func(p *InactivityPeriod, v uint32, b []byte, c *ownergraph.Restore) error {
		s, e := DecodeState(v, b)
		if e != nil {
			return e
		}
		return p.RestoreState(s, ownergraph.Loader[*Moment](c), ownergraph.Loader[messages.Message](c), nil)
	}}); e != nil {
		return e
	}
	if e := registerRetainedMessage[messages.Timeout](r, "messages.Timeout"); e != nil {
		return e
	}
	if e := registerRetainedMessage[messages.Slain](r, "messages.Slain"); e != nil {
		return e
	}
	if e := registerRetainedMessage[messages.Aura](r, "messages.Aura"); e != nil {
		return e
	}
	return registerRetainedMessage[messages.EncounterBoundary](r, "messages.EncounterBoundary")
}

// These are the retained-message adapters already owned by this package; each
// explicit concrete registration uses its existing codec, never field discovery.
func registerRetainedMessage[T any](r *ownergraph.Registry, typ string) error {
	return ownergraph.Register(r, ownergraph.Codec[T]{Type: typ, Version: MessageStateVersion, Init: func() *T { return new(T) }, Capture: func(v *T, c *ownergraph.Capture) ([]byte, error) {
		m, ok := any(v).(messages.Message)
		if !ok {
			return nil, fmt.Errorf("not a message")
		}
		s, e := CaptureMessage(m, ownergraph.Reference[messages.Message](c), ownergraph.Reference[*chrondbc.Spell](c))
		if e != nil {
			return nil, e
		}
		return s.Encode()
	}, Restore: func(v *T, version uint32, b []byte, c *ownergraph.Restore) error {
		s, e := DecodeMessageState(version, b)
		if e != nil {
			return e
		}
		m, e := s.Restore(ownergraph.Loader[messages.Message](c), ownergraph.Loader[*chrondbc.Spell](c))
		if e != nil {
			return e
		}
		typed, ok := any(m).(*T)
		if !ok {
			return fmt.Errorf("retained message type mismatch")
		}
		*v = *typed
		return nil
	}})
}
