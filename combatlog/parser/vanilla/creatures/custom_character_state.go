package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"time"
)

const TotemStateType = "vanilla.Totem"
const TotemStateVersion uint32 = 1

type TotemState struct{ value TotemValue }
type TotemValue struct {
	Base string       `json:"base"`
	Self totems.Totem `json:"value"`
}

func (c *Totem) CaptureState(capture func(*characters.Base[*TotemPeriod]) (string, error)) (TotemState, error) {
	if c == nil || c.Base == nil || capture == nil {
		return TotemState{}, fmt.Errorf("missing Totem dependencies")
	}
	ref, e := capture(c.Base)
	if e != nil {
		return TotemState{}, e
	}
	if ref == "" {
		return TotemState{}, fmt.Errorf("empty base reference")
	}
	return TotemState{TotemValue{ref, c.Self}}, nil
}
func (s TotemState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeTotemState(version uint32, payload []byte) (TotemState, error) {
	if version != TotemStateVersion {
		return TotemState{}, fmt.Errorf("unsupported Totem version")
	}
	var v TotemValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return TotemState{}, e
	}
	if v.Base == "" {
		return TotemState{}, fmt.Errorf("empty base reference")
	}
	return TotemState{v}, nil
}
func (c *Totem) RestoreState(s TotemState, resolve func(string) (*characters.Base[*TotemPeriod], error)) error {
	if c == nil || resolve == nil || s.value.Base == "" {
		return fmt.Errorf("missing Totem destination/dependencies")
	}
	base, e := resolve(s.value.Base)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil base")
	}
	*c = Totem{Base: base, Self: s.value.Self}
	return nil
}

const ObjectStateType = "vanilla.Object"
const ObjectStateVersion uint32 = 1

type ObjectState struct{ value ObjectValue }
type ObjectValue struct {
	Base        string        `json:"base"`
	MaxLifetime time.Duration `json:"value"`
}

func (c *Object) CaptureState(capture func(*characters.Base[*ObjectPeriod]) (string, error)) (ObjectState, error) {
	if c == nil || c.Base == nil || capture == nil {
		return ObjectState{}, fmt.Errorf("missing Object dependencies")
	}
	ref, e := capture(c.Base)
	if e != nil {
		return ObjectState{}, e
	}
	if ref == "" {
		return ObjectState{}, fmt.Errorf("empty base reference")
	}
	return ObjectState{ObjectValue{ref, c.MaxLifetime}}, nil
}
func (s ObjectState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeObjectState(version uint32, payload []byte) (ObjectState, error) {
	if version != ObjectStateVersion {
		return ObjectState{}, fmt.Errorf("unsupported Object version")
	}
	var v ObjectValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return ObjectState{}, e
	}
	if v.Base == "" {
		return ObjectState{}, fmt.Errorf("empty base reference")
	}
	return ObjectState{v}, nil
}
func (c *Object) RestoreState(s ObjectState, resolve func(string) (*characters.Base[*ObjectPeriod], error)) error {
	if c == nil || resolve == nil || s.value.Base == "" {
		return fmt.Errorf("missing Object destination/dependencies")
	}
	base, e := resolve(s.value.Base)
	if e != nil {
		return e
	}
	if base == nil {
		return fmt.Errorf("nil base")
	}
	*c = Object{Base: base, MaxLifetime: s.value.MaxLifetime}
	return nil
}
