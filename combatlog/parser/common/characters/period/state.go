package period

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const StateType = "period.WorkingPeriod"
const StateVersion uint32 = 1
const MomentStateType = "period.Moment"
const MomentStateVersion uint32 = 1

// State references canonical Moments. The caller captures those Values once and
// resolves them once for all histories/fights. No hooks or predicates are saved.
type State struct{ value periodValue }
type periodValue struct {
	Kind                string      `json:"kind"`
	Me                  guid.GUID   `json:"me"`
	Start               string      `json:"start"`
	End                 string      `json:"end"`
	LastActive          string      `json:"last_active"`
	EndState            EndState    `json:"end_state"`
	Timer               *timerValue `json:"timer"`
	HasTimeoutPredicate bool        `json:"has_timeout_predicate"`
}
type timerValue struct {
	NextTimeout   time.Time     `json:"next_timeout"`
	BumpBy        time.Duration `json:"bump_by"`
	PendingReset  bool          `json:"pending_reset"`
	ResetDeadline time.Time     `json:"reset_deadline"`
	ResetReason   string        `json:"reset_reason"`
	ResetMessage  string        `json:"reset_message"`
}
type MomentState struct{ value momentValue }
type momentValue struct {
	Message string `json:"message"`
	Reason  string `json:"reason"`
}

func captureMoment(m *Moment, capture func(*Moment) (string, error)) (string, error) {
	if m == nil {
		return "", nil
	}
	if capture == nil {
		return "", fmt.Errorf("missing moment capture")
	}
	path, err := capture(m)
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", fmt.Errorf("empty moment reference")
	}
	return path, nil
}
func captureMessage(m messages.Message, capture func(messages.Message) (string, error)) (string, error) {
	if m == nil {
		return "", nil
	}
	if err := supportedMessage(m); err != nil {
		return "", err
	}
	if capture == nil {
		return "", fmt.Errorf("missing message capture")
	}
	path, err := capture(m)
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", fmt.Errorf("empty message reference")
	}
	return path, nil
}
func CaptureMoment(m *Moment, capture func(messages.Message) (string, error)) (MomentState, error) {
	if m == nil {
		return MomentState{}, fmt.Errorf("nil moment")
	}
	path, err := captureMessage(m.Timestamp, capture)
	if err != nil {
		return MomentState{}, err
	}
	return MomentState{momentValue{path, m.Reason}}, nil
}
func (s MomentState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeMomentState(version uint32, payload []byte) (MomentState, error) {
	if version != MomentStateVersion {
		return MomentState{}, fmt.Errorf("unsupported moment version")
	}
	var v momentValue
	if err := decodeComplete(payload, &v); err != nil {
		return MomentState{}, err
	}
	return MomentState{v}, nil
}
func resolveMessage(path string, resolve func(string) (messages.Message, error)) (messages.Message, error) {
	if path == "" {
		return nil, nil
	}
	if resolve == nil {
		return nil, fmt.Errorf("missing message resolver")
	}
	m, err := resolve(path)
	if err != nil {
		return nil, err
	}
	if err := supportedMessage(m); err != nil {
		return nil, err
	}
	return m, nil
}
func (s MomentState) Restore(resolve func(string) (messages.Message, error)) (*Moment, error) {
	m, err := resolveMessage(s.value.Message, resolve)
	if err != nil {
		return nil, err
	}
	return &Moment{Timestamp: m, Reason: s.value.Reason}, nil
}

// CaptureState dispatches only to an owner's explicit codec method. It does not
// know how to reconstruct concrete periods or serialize arbitrary custom types.
func CaptureState(p IsPeriod, moments func(*Moment) (string, error), message func(messages.Message) (string, error)) (State, error) {
	owner, ok := p.(interface {
		CaptureState(func(*Moment) (string, error), func(messages.Message) (string, error)) (State, error)
	})
	if !ok {
		return State{}, fmt.Errorf("unsupported period %T", p)
	}
	return owner.CaptureState(moments, message)
}

func capturePeriod(value periodValue, base *Period, moments func(*Moment) (string, error)) (State, error) {
	var err error
	value.Start, err = captureMoment(base.Start, moments)
	if err != nil {
		return State{}, err
	}
	value.End, err = captureMoment(base.End, moments)
	if err != nil {
		return State{}, err
	}
	value.LastActive, err = captureMoment(base.LastActive, moments)
	if err != nil {
		return State{}, err
	}
	value.EndState = base.EndState
	return State{value}, nil
}
func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }
func (v periodValue) validate() error {
	if v.Kind == "empty" && v.Timer == nil && !v.HasTimeoutPredicate {
		return nil
	}
	if v.Kind == "inactivity" && v.Timer != nil {
		return nil
	}
	return fmt.Errorf("invalid period kind/configuration")
}
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported period version")
	}
	var v periodValue
	if err := decodeComplete(payload, &v); err != nil {
		return State{}, err
	}
	if err := v.validate(); err != nil {
		return State{}, err
	}
	return State{v}, nil
}

// restoreMoments resolves references only; concrete owners load their own state.
func (s State) restoreMoments(moments func(string) (*Moment, error)) (*Period, error) {
	v := s.value

	resolve := func(path string) (*Moment, error) {
		if path == "" {
			return nil, nil
		}
		if moments == nil {
			return nil, fmt.Errorf("missing moment resolver")
		}
		m, err := moments(path)
		if err != nil {
			return nil, err
		}
		if m == nil {
			return nil, fmt.Errorf("nil resolved moment")
		}
		return m, nil
	}
	start, err := resolve(v.Start)
	if err != nil {
		return nil, err
	}
	end, err := resolve(v.End)
	if err != nil {
		return nil, err
	}
	last, err := resolve(v.LastActive)
	if err != nil {
		return nil, err
	}
	return &Period{Start: start, End: end, LastActive: last, EndState: v.EndState}, nil
}

// Complete typed JSON validation rejects missing fields, null scalars, unknown
// fields and duplicate keys without reflecting over live objects. These DTOs
// emit every field; exact semantic JSON round-trip is their versioned contract.
func decodeComplete(payload []byte, value any) error {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing period state")
	}
	expected, err := json.Marshal(value)
	if err != nil {
		return err
	}
	a, err := canonicalJSON(payload)
	if err != nil {
		return err
	}
	b, err := canonicalJSON(expected)
	if err != nil {
		return err
	}
	if !bytes.Equal(a, b) {
		return fmt.Errorf("incomplete period state")
	}
	return nil
}
func canonicalJSON(payload []byte) ([]byte, error) {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.UseNumber()
	var read func() (any, error)
	read = func() (any, error) {
		token, err := d.Token()
		if err != nil {
			return nil, err
		}
		switch token {
		case json.Delim('{'):
			v := map[string]any{}
			for d.More() {
				token, err := d.Token()
				if err != nil {
					return nil, err
				}
				key := token.(string)
				if _, ok := v[key]; ok {
					return nil, fmt.Errorf("duplicate state field")
				}
				child, err := read()
				if err != nil {
					return nil, err
				}
				v[key] = child
			}
			_, err = d.Token()
			return v, err
		case json.Delim('['):
			v := []any{}
			for d.More() {
				child, err := read()
				if err != nil {
					return nil, err
				}
				v = append(v, child)
			}
			_, err = d.Token()
			return v, err
		default:
			return token, nil
		}
	}
	value, err := read()
	if err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func supportedMessage(m messages.Message) error {
	switch m := m.(type) {
	case *messages.Damage:
		if m == nil {
			return fmt.Errorf("nil damage reference")
		}
	case *messages.Aura:
		if m == nil {
			return fmt.Errorf("nil aura reference")
		}
	case *messages.Slain:
		if m == nil {
			return fmt.Errorf("nil slain reference")
		}
	case *messages.Timeout:
		if m == nil {
			return fmt.Errorf("nil timeout reference")
		}
	case *messages.EncounterBoundary:
		if m == nil {
			return fmt.Errorf("nil boundary reference")
		}
	default:
		return fmt.Errorf("unsupported resolved retained message %T", m)
	}
	return nil
}
