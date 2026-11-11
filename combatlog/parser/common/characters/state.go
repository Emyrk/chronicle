package characters

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const BaseStateType = "characters.Base"
const BaseStateVersion uint32 = 1
const CommonStateType = "characters.Common"
const CommonStateVersion uint32 = 1
const NeverActiveStateType = "characters.NeverActive"
const NeverActiveStateVersion uint32 = 1

type BaseState struct{ value baseValue }
type baseValue struct {
	ID            guid.GUID       `json:"id"`
	RecentlySlain time.Duration   `json:"recently_slain"`
	LastSlain     string          `json:"last_slain"`
	Activity      json.RawMessage `json:"activity"`
}

func (c *Base[M]) CaptureState(periods func(M) (string, error), message func(messages.Message) (string, error)) (BaseState, error) {
	if c == nil {
		return BaseState{}, fmt.Errorf("nil character base")
	}
	history, err := c.Activity.CaptureState(periods)
	if err != nil {
		return BaseState{}, err
	}
	encoded, err := history.Encode()
	if err != nil {
		return BaseState{}, err
	}
	v := baseValue{ID: c.id, RecentlySlain: c.recentlySlain, Activity: encoded}
	if c.LastSlain != nil {
		if message == nil {
			return BaseState{}, fmt.Errorf("missing last slain capture")
		}
		v.LastSlain, err = message(c.LastSlain)
		if err != nil {
			return BaseState{}, err
		}
		if v.LastSlain == "" {
			return BaseState{}, fmt.Errorf("empty last slain reference")
		}
	}
	return BaseState{v}, nil
}
func (s BaseState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeBaseState(version uint32, payload []byte) (BaseState, error) {
	if version != BaseStateVersion {
		return BaseState{}, fmt.Errorf("unsupported character base version")
	}
	var v baseValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return BaseState{}, err
	}
	if _, err := period.DecodeCollectorState(period.CollectorStateVersion, v.Activity); err != nil {
		return BaseState{}, err
	}
	return BaseState{v}, nil
}

// RestoreState only assigns owned fields and canonical references. It never adds
// itself to lookup, changes Units, restores another owner, or invokes hooks.
func (c *Base[M]) RestoreState(s BaseState, lookup *Characters, periods func(string) (M, error), message func(string) (messages.Message, error)) error {
	if c == nil || lookup == nil {
		return fmt.Errorf("base requires destination and canonical lookup")
	}
	history, err := period.DecodeCollectorState(period.CollectorStateVersion, s.value.Activity)
	if err != nil {
		return err
	}
	var activity period.PeriodCollector[M]
	if err := activity.RestoreState(history, periods); err != nil {
		return err
	}
	var last messages.Message
	if s.value.LastSlain != "" {
		if message == nil {
			return fmt.Errorf("missing last slain resolver")
		}
		last, err = message(s.value.LastSlain)
		if err != nil {
			return err
		}
		if last == nil {
			return fmt.Errorf("nil last slain reference")
		}
	}
	*c = Base[M]{lookup: lookup, id: s.value.ID, Activity: activity, LastSlain: last, recentlySlain: s.value.RecentlySlain}
	return nil
}

type CommonState struct{ value commonValue }
type commonValue struct {
	Base                json.RawMessage `json:"base"`
	Timeout             time.Duration   `json:"timeout"`
	HasTimeoutPredicate bool            `json:"has_timeout_predicate"`
}

func (c *Common) CaptureState(periods func(*period.InactivityPeriod) (string, error), message func(messages.Message) (string, error)) (CommonState, error) {
	if c == nil || c.Base == nil {
		return CommonState{}, fmt.Errorf("nil common character")
	}
	base, err := c.Base.CaptureState(periods, message)
	if err != nil {
		return CommonState{}, err
	}
	encoded, err := base.Encode()
	if err != nil {
		return CommonState{}, err
	}
	return CommonState{commonValue{encoded, c.timeout, c.timeoutAsDeathIf != nil}}, nil
}
func (s CommonState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeCommonState(version uint32, payload []byte) (CommonState, error) {
	if version != CommonStateVersion {
		return CommonState{}, fmt.Errorf("unsupported common character version")
	}
	var v commonValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return CommonState{}, err
	}
	if _, err := DecodeBaseState(BaseStateVersion, v.Base); err != nil {
		return CommonState{}, err
	}
	return CommonState{v}, nil
}

// RestoreState accepts an already-initialized canonical Base. It does not allocate
// a second Base or modify the dependency. Its codec must have loaded Base first.
// Callback assignment is inert; runtime hooks are wired separately after validation.
func (c *Common) RestoreState(s CommonState, base *Base[*period.InactivityPeriod], predicate TimeoutAsDeathCondition) error {
	if c == nil || base == nil {
		return fmt.Errorf("common requires destination and canonical base")
	}
	expected, err := DecodeBaseState(BaseStateVersion, s.value.Base)
	if err != nil {
		return err
	}
	if base.id != expected.value.ID {
		return fmt.Errorf("common base identity mismatch")
	}
	if s.value.HasTimeoutPredicate != (predicate != nil) {
		return fmt.Errorf("common timeout predicate presence mismatch")
	}
	*c = Common{Base: base, timeout: s.value.Timeout, timeoutAsDeathIf: predicate}
	return nil
}

// BaseState exposes the embedded owner's detached payload for init/load ordering.
func (s CommonState) BaseState() (BaseState, error) {
	return DecodeBaseState(BaseStateVersion, s.value.Base)
}

type NeverActiveState struct{ value neverActiveValue }
type neverActiveValue struct {
	ID      guid.GUID `json:"id"`
	Persist bool      `json:"persist"`
}

func (c NeverActive) CaptureState() NeverActiveState {
	return NeverActiveState{neverActiveValue{c.id, c.persistInInstance}}
}
func (s NeverActiveState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeNeverActiveState(version uint32, payload []byte) (NeverActiveState, error) {
	if version != NeverActiveStateVersion {
		return NeverActiveState{}, fmt.Errorf("unsupported never-active version")
	}
	var v neverActiveValue
	if err := decodeCharacterValue(payload, &v); err != nil {
		return NeverActiveState{}, err
	}
	return NeverActiveState{v}, nil
}
func (c *NeverActive) RestoreState(s NeverActiveState) error {
	if c == nil {
		return fmt.Errorf("nil never-active destination")
	}
	*c = NeverActive{id: s.value.ID, persistInInstance: s.value.Persist}
	return nil
}

// State-only JSON validation; no reflection over character objects or factory
// discovery. Every DTO field is emitted and required, including explicit nulls.
func decodeCharacterValue(payload []byte, value any) error {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing character state")
	}
	expected, err := json.Marshal(value)
	if err != nil {
		return err
	}
	a, err := characterJSON(payload)
	if err != nil {
		return err
	}
	b, err := characterJSON(expected)
	if err != nil {
		return err
	}
	if !bytes.Equal(a, b) {
		return fmt.Errorf("incomplete character state")
	}
	return nil
}
func characterJSON(payload []byte) ([]byte, error) {
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
					return nil, fmt.Errorf("duplicate character field")
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
