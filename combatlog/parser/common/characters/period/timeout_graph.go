package period

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// TrustedTimeoutOwner is an explicitly registered owner of a declarative
// timeout recipe. The archive selects no function or executable code.
// Production registration admits Common as the concrete implementation. Any
// additional implementation requires an explicit codec registered by trusted Go
// composition code; satisfying this interface alone cannot admit an archive
// owner. ValidateTimeoutRecipe must reject every unsupported declarative recipe.
type TrustedTimeoutOwner interface {
	ID() guid.GUID
	ValidateTimeoutRecipe() error
	TimeoutCountsAsDeath() bool
}

func (p *InactivityPeriod) WithTrustedTimeoutOwner(owner TrustedTimeoutOwner) *InactivityPeriod {
	p.trustedTimeoutOwner = owner
	p.timeoutAsDeathIf = owner.TimeoutCountsAsDeath
	return p
}

// WireTimeoutRuntime attaches the validated recipe without evaluating it.
func (p *InactivityPeriod) WireTimeoutRuntime() {
	if p.trustedTimeoutOwner != nil {
		p.timeoutAsDeathIf = p.trustedTimeoutOwner.TimeoutCountsAsDeath
	}
}

type inactivityGraphValue struct {
	State json.RawMessage `json:"state"`
	Owner string          `json:"timeout_owner"`
}

func registerInactivityGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[InactivityPeriod]{Type: StateType + ".Inactivity", Version: StateVersion, Init: func() *InactivityPeriod { return new(InactivityPeriod) }, Capture: func(p *InactivityPeriod, ctx *ownergraph.Capture) ([]byte, error) {
		s, e := p.CaptureState(ownergraph.Reference[*Moment](ctx), ownergraph.Reference[messages.Message](ctx))
		if e != nil {
			return nil, e
		}
		var ref string
		if s.value.HasTimeoutPredicate {
			if p.trustedTimeoutOwner == nil {
				return nil, fmt.Errorf("period callback requires trusted graph adapter")
			}
			if e := p.trustedTimeoutOwner.ValidateTimeoutRecipe(); e != nil {
				return nil, e
			}
			ref, e = ctx.Ref(p.trustedTimeoutOwner)
			if e != nil {
				return nil, e
			}
		}
		b, e := s.Encode()
		if e != nil {
			return nil, e
		}
		return json.Marshal(inactivityGraphValue{b, ref})
	}, Restore: func(p *InactivityPeriod, v uint32, b []byte, ctx *ownergraph.Restore) error {
		var g inactivityGraphValue
		if e := decodeComplete(b, &g); e != nil {
			return e
		}
		s, e := DecodeState(v, g.State)
		if e != nil {
			return e
		}
		if s.value.HasTimeoutPredicate != (g.Owner != "") {
			return fmt.Errorf("timeout owner presence mismatch")
		}
		var owner TrustedTimeoutOwner
		if g.Owner != "" {
			owner, e = ownergraph.ResolveAs[TrustedTimeoutOwner](ctx, g.Owner)
			if e != nil {
				return e
			}
		}
		// Runtime callback attachment is deferred until the enclosing graph is wired.
		s.value.HasTimeoutPredicate = false
		if e := p.RestoreState(s, ownergraph.Loader[*Moment](ctx), ownergraph.Loader[messages.Message](ctx), nil); e != nil {
			return e
		}
		p.trustedTimeoutOwner = owner
		return nil
	}, Validate: func(p *InactivityPeriod) error {
		if p.trustedTimeoutOwner == nil {
			return nil
		}
		if p.me != p.trustedTimeoutOwner.ID() {
			return fmt.Errorf("timeout owner identity mismatch")
		}
		return p.trustedTimeoutOwner.ValidateTimeoutRecipe()
	}})
}
