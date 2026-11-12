package period

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const MessageStateType = "period.RetainedMessage"
const MessageStateVersion uint32 = 1

// MessageState is an explicit bounded adapter, not a generic message serializer.
// Capture/restore one Value per message pointer in the enclosing graph. Damage
// remains a reference to its existing canonical owner, never a copied payload.
type MessageState struct{ value messageValue }
type messageValue struct {
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload"`
}
type auraMessageValue struct {
	Base        messages.MessageBaseState `json:"base"`
	IsBuff      bool                      `json:"is_buff"`
	Source      *guid.GUID                `json:"source"`
	Target      guid.GUID                 `json:"target"`
	SpellName   string                    `json:"spell_name"`
	SpellID     chrondbc.SpellID          `json:"spell_id"`
	SpellPath   string                    `json:"spell_path"`
	Amount      int32                     `json:"amount"`
	Application types.AuraApplication     `json:"application"`
	Transition  messages.AuraTransition   `json:"transition"`
	State       types.AuraState           `json:"state"`
}
type slainMessageValue struct {
	Base                 messages.MessageBaseState `json:"base"`
	Victim               guid.GUID                 `json:"victim"`
	Killer               *guid.GUID                `json:"killer"`
	Attribution          string                    `json:"attribution"`
	AttributionNilDamage bool                      `json:"attribution_nil_damage,omitempty"`
}
type timeoutMessageValue struct {
	Base messages.MessageBaseState `json:"base"`
}
type damageMessageValue struct {
	Reference string `json:"reference"`
}
type boundaryMessageValue struct {
	Base             messages.MessageBaseState `json:"base"`
	Active           bool                      `json:"active"`
	EncounterID      int32                     `json:"encounter_id"`
	Name             string                    `json:"name"`
	Difficulty       int32                     `json:"difficulty"`
	GroupSize        int32                     `json:"group_size"`
	InstanceID       uint32                    `json:"instance_id"`
	Success          *bool                     `json:"success"`
	PreserveActivity bool                      `json:"preserve_activity"`
}

func copyPointer[T any](p *T) *T {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}
func CaptureMessage(m messages.Message, capture func(messages.Message) (string, error), spell func(*chrondbc.Spell) (string, error)) (MessageState, error) {
	var kind string
	var payload any
	switch m := m.(type) {
	case *messages.Damage:
		if m == nil {
			return MessageState{}, fmt.Errorf("nil damage")
		}
		ref, err := captureMessage(m, capture)
		if err != nil {
			return MessageState{}, err
		}
		kind = "damage"
		payload = damageMessageValue{ref}
	case *messages.Aura:
		if m == nil {
			return MessageState{}, fmt.Errorf("nil aura")
		}
		var path string
		if m.SpellData != nil {
			if spell == nil {
				return MessageState{}, fmt.Errorf("missing spell capture")
			}
			var err error
			path, err = spell(m.SpellData)
			if err != nil {
				return MessageState{}, err
			}
			if path == "" {
				return MessageState{}, fmt.Errorf("empty spell reference")
			}
		}
		kind = "aura"
		payload = auraMessageValue{m.CaptureState(), m.IsBuff, copyPointer(m.Source), m.Target, m.SpellName, m.SpellID, path, m.Amount, m.Application, m.Transition, m.State}
	case *messages.Slain:
		if m == nil {
			return MessageState{}, fmt.Errorf("nil slain")
		}
		var ref string
		// CCv2 DEATH can retain a typed-nil *Damage in its Message interface.
		// Preserve that distinction exactly; it is not a canonical referenced owner.
		damage, isDamage := m.Attribution.(*messages.Damage)
		nilDamage := isDamage && damage == nil
		if !nilDamage {
			var err error
			ref, err = captureMessage(m.Attribution, capture)
			if err != nil {
				return MessageState{}, err
			}
		}
		kind = "slain"
		payload = slainMessageValue{Base: m.CaptureState(), Victim: m.Victim, Killer: copyPointer(m.Killer), Attribution: ref, AttributionNilDamage: nilDamage}
	case *messages.Timeout:
		if m == nil {
			return MessageState{}, fmt.Errorf("nil timeout")
		}
		kind = "timeout"
		payload = timeoutMessageValue{m.CaptureState()}
	case *messages.EncounterBoundary:
		if m == nil {
			return MessageState{}, fmt.Errorf("nil boundary")
		}
		kind = "boundary"
		payload = boundaryMessageValue{m.CaptureState(), m.Active, m.EncounterID, m.Name, m.Difficulty, m.GroupSize, m.InstanceID, copyPointer(m.Success), m.PreserveActivity}
	default:
		return MessageState{}, fmt.Errorf("unsupported retained message %T", m)
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return MessageState{}, err
	}
	return MessageState{messageValue{kind, encoded}}, nil
}
func (s MessageState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func (s MessageState) decodePayload() (any, error) {
	var v any
	switch s.value.Kind {
	case "damage":
		v = &damageMessageValue{}
	case "aura":
		v = &auraMessageValue{}
	case "slain":
		v = &slainMessageValue{}
	case "timeout":
		v = &timeoutMessageValue{}
	case "boundary":
		v = &boundaryMessageValue{}
	default:
		return nil, fmt.Errorf("unsupported retained message kind %q", s.value.Kind)
	}
	if err := decodeComplete(s.value.Payload, v); err != nil {
		return nil, err
	}
	var base *messages.MessageBaseState
	switch v := v.(type) {
	case *damageMessageValue:
		if v.Reference == "" {
			return nil, fmt.Errorf("empty damage reference")
		}
	case *auraMessageValue:
		base = &v.Base
	case *slainMessageValue:
		base = &v.Base
	case *timeoutMessageValue:
		base = &v.Base
	case *boundaryMessageValue:
		base = &v.Base
	}
	if base != nil && !base.MarksPresent && base.Marks != nil {
		return nil, fmt.Errorf("marks presence mismatch")
	}
	return v, nil
}
func DecodeMessageState(version uint32, payload []byte) (MessageState, error) {
	if version != MessageStateVersion {
		return MessageState{}, fmt.Errorf("unsupported retained message version")
	}
	var v messageValue
	if err := decodeComplete(payload, &v); err != nil {
		return MessageState{}, err
	}
	s := MessageState{v}
	if _, err := s.decodePayload(); err != nil {
		return MessageState{}, err
	}
	return s, nil
}
func (s MessageState) Restore(resolve func(string) (messages.Message, error), spell func(string) (*chrondbc.Spell, error)) (messages.Message, error) {
	value, err := s.decodePayload()
	if err != nil {
		return nil, err
	}
	switch v := value.(type) {
	case *damageMessageValue:
		m, err := resolveMessage(v.Reference, resolve)
		if err != nil {
			return nil, err
		}
		d, ok := m.(*messages.Damage)
		if !ok || d == nil {
			return nil, fmt.Errorf("reference is not canonical damage")
		}
		return d, nil
	case *auraMessageValue:
		var sp *chrondbc.Spell
		if v.SpellPath != "" {
			if spell == nil {
				return nil, fmt.Errorf("missing spell resolver")
			}
			sp, err = spell(v.SpellPath)
			if err != nil {
				return nil, err
			}
			if sp == nil {
				return nil, fmt.Errorf("nil resolved spell")
			}
		}
		return &messages.Aura{MessageBase: v.Base.Restore(), IsBuff: v.IsBuff, Source: v.Source, Target: v.Target, SpellName: v.SpellName, SpellID: v.SpellID, SpellData: sp, Amount: v.Amount, Application: v.Application, Transition: v.Transition, State: v.State}, nil
	case *slainMessageValue:
		if v.AttributionNilDamage && v.Attribution != "" {
			return nil, fmt.Errorf("conflicting slain attribution")
		}
		attribution, err := resolveMessage(v.Attribution, resolve)
		if err != nil {
			return nil, err
		}
		if v.AttributionNilDamage {
			attribution = (*messages.Damage)(nil)
		}
		return &messages.Slain{MessageBase: v.Base.Restore(), Victim: v.Victim, Killer: v.Killer, Attribution: attribution}, nil
	case *timeoutMessageValue:
		return &messages.Timeout{MessageBase: v.Base.Restore()}, nil
	case *boundaryMessageValue:
		return &messages.EncounterBoundary{MessageBase: v.Base.Restore(), Active: v.Active, EncounterID: v.EncounterID, Name: v.Name, Difficulty: v.Difficulty, GroupSize: v.GroupSize, InstanceID: v.InstanceID, Success: v.Success, PreserveActivity: v.PreserveActivity}, nil
	default:
		return nil, fmt.Errorf("unsupported message payload")
	}
}
