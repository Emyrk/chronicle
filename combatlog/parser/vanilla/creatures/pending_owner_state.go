package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"reflect"
)

func nilPendingMessage(m messages.Message) bool {
	v := reflect.ValueOf(m)
	return !v.IsValid() || (v.Kind() == reflect.Pointer && v.IsNil())
}

const HighPriestThekalPartyStateType = "vanilla.HighPriestThekalParty"
const HighPriestThekalPartyStateVersion uint32 = 1

type HighPriestThekalPartyState struct{ value HighPriestThekalPartyValue }
type HighPriestThekalPartyValue struct {
	Common       string `json:"common"`
	PendingDeath string `json:"pending_death"`
}

func (c *HighPriestThekalParty) CaptureState(common func(*characters.Common) (string, error), message func(messages.Message) (string, error)) (HighPriestThekalPartyState, error) {
	if c == nil || c.all == nil {
		return HighPriestThekalPartyState{}, fmt.Errorf("missing HighPriestThekalParty dependencies")
	}
	base, e := captureCommonOwner("HighPriestThekalParty", c.Common, common)
	if e != nil {
		return HighPriestThekalPartyState{}, e
	}
	v := HighPriestThekalPartyValue{Common: base.reference}
	if c.pendingDeath != nil {
		if nilPendingMessage(*c.pendingDeath) || message == nil {
			return HighPriestThekalPartyState{}, fmt.Errorf("missing pending death/capture")
		}
		v.PendingDeath, e = message(*c.pendingDeath)
		if e != nil {
			return HighPriestThekalPartyState{}, e
		}
		if v.PendingDeath == "" {
			return HighPriestThekalPartyState{}, fmt.Errorf("empty pending death reference")
		}
	}
	return HighPriestThekalPartyState{v}, nil
}
func (s HighPriestThekalPartyState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeHighPriestThekalPartyState(version uint32, payload []byte) (HighPriestThekalPartyState, error) {
	if version != HighPriestThekalPartyStateVersion {
		return HighPriestThekalPartyState{}, fmt.Errorf("unsupported HighPriestThekalParty version")
	}
	var v HighPriestThekalPartyValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return HighPriestThekalPartyState{}, e
	}
	if v.Common == "" {
		return HighPriestThekalPartyState{}, fmt.Errorf("empty Common reference")
	}
	return HighPriestThekalPartyState{v}, nil
}
func (c *HighPriestThekalParty) RestoreState(s HighPriestThekalPartyState, all *characters.Characters, common func(string) (*characters.Common, error), message func(string) (messages.Message, error)) error {
	if c == nil || all == nil {
		return fmt.Errorf("missing HighPriestThekalParty destination/dependencies")
	}
	base, e := (CommonOwnerState{owner: "HighPriestThekalParty", reference: s.value.Common}).resolve("HighPriestThekalParty", common)
	if e != nil {
		return e
	}
	var pending *messages.Message
	if s.value.PendingDeath != "" {
		if message == nil {
			return fmt.Errorf("missing pending message resolver")
		}
		m, e := message(s.value.PendingDeath)
		if e != nil {
			return e
		}
		if nilPendingMessage(m) {
			return fmt.Errorf("nil pending death")
		}
		pending = &m
	}
	*c = HighPriestThekalParty{Common: base, all: all, pendingDeath: pending}
	return nil
}

const SneedShredderStateType = "vanilla.SneedShredder"
const SneedShredderStateVersion uint32 = 1

type SneedShredderState struct{ value SneedShredderValue }
type SneedShredderValue struct {
	Common       string `json:"common"`
	PendingDeath string `json:"pending_death"`
}

func (c *SneedShredder) CaptureState(common func(*characters.Common) (string, error), message func(messages.Message) (string, error)) (SneedShredderState, error) {
	if c == nil || c.all == nil {
		return SneedShredderState{}, fmt.Errorf("missing SneedShredder dependencies")
	}
	base, e := captureCommonOwner("SneedShredder", c.Common, common)
	if e != nil {
		return SneedShredderState{}, e
	}
	v := SneedShredderValue{Common: base.reference}
	if c.pendingDeath != nil {
		if nilPendingMessage(c.pendingDeath) || message == nil {
			return SneedShredderState{}, fmt.Errorf("missing pending death/capture")
		}
		v.PendingDeath, e = message(c.pendingDeath)
		if e != nil {
			return SneedShredderState{}, e
		}
		if v.PendingDeath == "" {
			return SneedShredderState{}, fmt.Errorf("empty pending death reference")
		}
	}
	return SneedShredderState{v}, nil
}
func (s SneedShredderState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeSneedShredderState(version uint32, payload []byte) (SneedShredderState, error) {
	if version != SneedShredderStateVersion {
		return SneedShredderState{}, fmt.Errorf("unsupported SneedShredder version")
	}
	var v SneedShredderValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return SneedShredderState{}, e
	}
	if v.Common == "" {
		return SneedShredderState{}, fmt.Errorf("empty Common reference")
	}
	return SneedShredderState{v}, nil
}
func (c *SneedShredder) RestoreState(s SneedShredderState, all *characters.Characters, common func(string) (*characters.Common, error), message func(string) (messages.Message, error)) error {
	if c == nil || all == nil {
		return fmt.Errorf("missing SneedShredder destination/dependencies")
	}
	base, e := (CommonOwnerState{owner: "SneedShredder", reference: s.value.Common}).resolve("SneedShredder", common)
	if e != nil {
		return e
	}
	var pending messages.Message
	if s.value.PendingDeath != "" {
		if message == nil {
			return fmt.Errorf("missing pending message resolver")
		}
		m, e := message(s.value.PendingDeath)
		if e != nil {
			return e
		}
		if nilPendingMessage(m) {
			return fmt.Errorf("nil pending death")
		}
		pending = m
	}
	*c = SneedShredder{Common: base, all: all, pendingDeath: pending}
	return nil
}

const CthunPartyStateType = "vanilla.CthunParty"
const CthunPartyStateVersion uint32 = 1

type CthunPartyState struct{ value CthunPartyValue }
type CthunPartyValue struct {
	Common       string `json:"common"`
	PendingDeath string `json:"pending_death"`
	Entry        uint32 `json:"entry"`
	EyeDone      bool   `json:"eyeDone"`
}

func (c *CthunParty) CaptureState(common func(*characters.Common) (string, error), message func(messages.Message) (string, error)) (CthunPartyState, error) {
	if c == nil || c.all == nil {
		return CthunPartyState{}, fmt.Errorf("missing CthunParty dependencies")
	}
	base, e := captureCommonOwner("CthunParty", c.Common, common)
	if e != nil {
		return CthunPartyState{}, e
	}
	v := CthunPartyValue{Common: base.reference, Entry: c.entry, EyeDone: c.eyeDone}
	if c.pendingDeath != nil {
		if nilPendingMessage(*c.pendingDeath) || message == nil {
			return CthunPartyState{}, fmt.Errorf("missing pending death/capture")
		}
		v.PendingDeath, e = message(*c.pendingDeath)
		if e != nil {
			return CthunPartyState{}, e
		}
		if v.PendingDeath == "" {
			return CthunPartyState{}, fmt.Errorf("empty pending death reference")
		}
	}
	return CthunPartyState{v}, nil
}
func (s CthunPartyState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeCthunPartyState(version uint32, payload []byte) (CthunPartyState, error) {
	if version != CthunPartyStateVersion {
		return CthunPartyState{}, fmt.Errorf("unsupported CthunParty version")
	}
	var v CthunPartyValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return CthunPartyState{}, e
	}
	if v.Common == "" {
		return CthunPartyState{}, fmt.Errorf("empty Common reference")
	}
	return CthunPartyState{v}, nil
}
func (c *CthunParty) RestoreState(s CthunPartyState, all *characters.Characters, common func(string) (*characters.Common, error), message func(string) (messages.Message, error)) error {
	if c == nil || all == nil {
		return fmt.Errorf("missing CthunParty destination/dependencies")
	}
	base, e := (CommonOwnerState{owner: "CthunParty", reference: s.value.Common}).resolve("CthunParty", common)
	if e != nil {
		return e
	}
	var pending *messages.Message
	if s.value.PendingDeath != "" {
		if message == nil {
			return fmt.Errorf("missing pending message resolver")
		}
		m, e := message(s.value.PendingDeath)
		if e != nil {
			return e
		}
		if nilPendingMessage(m) {
			return fmt.Errorf("nil pending death")
		}
		pending = &m
	}
	*c = CthunParty{Common: base, all: all, pendingDeath: pending, entry: s.value.Entry, eyeDone: s.value.EyeDone}
	return nil
}
