package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"time"
)

const TotemPeriodStateType = "vanilla.TotemPeriod"
const TotemPeriodStateVersion uint32 = 1

type TotemPeriodState struct{ value totemPeriodValue }
type totemPeriodValue struct {
	Core        json.RawMessage `json:"core"`
	NextTimeout time.Time       `json:"NextTimeout"`
	BumpBy      time.Duration   `json:"BumpBy"`
	MaxLifetime time.Time       `json:"MaxLifetime"`
}

func (p *TotemPeriod) CaptureState(moments func(*period.Moment) (string, error)) (TotemPeriodState, error) {
	if p == nil || p.WorkingPeriod == nil {
		return TotemPeriodState{}, fmt.Errorf("nil TotemPeriod")
	}
	core, e := p.CaptureCoreState(moments)
	if e != nil {
		return TotemPeriodState{}, e
	}
	data, e := core.Encode()
	if e != nil {
		return TotemPeriodState{}, e
	}
	return TotemPeriodState{totemPeriodValue{Core: data, NextTimeout: p.Meta.NextTimeout, BumpBy: p.Meta.BumpBy, MaxLifetime: p.Meta.MaxLifetime}}, nil
}
func (s TotemPeriodState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeTotemPeriodState(version uint32, payload []byte) (TotemPeriodState, error) {
	if version != TotemPeriodStateVersion {
		return TotemPeriodState{}, fmt.Errorf("unsupported TotemPeriod version")
	}
	var v totemPeriodValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return TotemPeriodState{}, e
	}
	if _, e := period.DecodeCoreState(period.CoreStateVersion, v.Core); e != nil {
		return TotemPeriodState{}, e
	}
	return TotemPeriodState{v}, nil
}
func (p *TotemPeriod) RestoreState(s TotemPeriodState, moments func(string) (*period.Moment, error)) error {
	if p == nil {
		return fmt.Errorf("nil TotemPeriod destination")
	}
	core, e := period.DecodeCoreState(period.CoreStateVersion, s.value.Core)
	if e != nil {
		return e
	}
	meta := &TotemMeta{NextTimeout: s.value.NextTimeout, BumpBy: s.value.BumpBy, MaxLifetime: s.value.MaxLifetime}
	base := new(period.WorkingPeriod[TotemMeta])
	if e := base.RestoreCoreState(core, meta, moments); e != nil {
		return e
	}
	*p = TotemPeriod{WorkingPeriod: base}
	return nil
}

const ObjectPeriodStateType = "vanilla.ObjectPeriod"
const ObjectPeriodStateVersion uint32 = 1

type ObjectPeriodState struct{ value objectPeriodValue }
type objectPeriodValue struct {
	Core        json.RawMessage `json:"core"`
	NextTimeout time.Time       `json:"NextTimeout"`
	MaxLifetime time.Duration   `json:"max_lifetime"`
}

func (p *ObjectPeriod) CaptureState(moments func(*period.Moment) (string, error)) (ObjectPeriodState, error) {
	if p == nil || p.WorkingPeriod == nil {
		return ObjectPeriodState{}, fmt.Errorf("nil ObjectPeriod")
	}
	core, e := p.CaptureCoreState(moments)
	if e != nil {
		return ObjectPeriodState{}, e
	}
	data, e := core.Encode()
	if e != nil {
		return ObjectPeriodState{}, e
	}
	return ObjectPeriodState{objectPeriodValue{Core: data, NextTimeout: p.Meta.NextTimeout, MaxLifetime: p.MaxLifetime}}, nil
}
func (s ObjectPeriodState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeObjectPeriodState(version uint32, payload []byte) (ObjectPeriodState, error) {
	if version != ObjectPeriodStateVersion {
		return ObjectPeriodState{}, fmt.Errorf("unsupported ObjectPeriod version")
	}
	var v objectPeriodValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return ObjectPeriodState{}, e
	}
	if _, e := period.DecodeCoreState(period.CoreStateVersion, v.Core); e != nil {
		return ObjectPeriodState{}, e
	}
	return ObjectPeriodState{v}, nil
}
func (p *ObjectPeriod) RestoreState(s ObjectPeriodState, moments func(string) (*period.Moment, error)) error {
	if p == nil {
		return fmt.Errorf("nil ObjectPeriod destination")
	}
	core, e := period.DecodeCoreState(period.CoreStateVersion, s.value.Core)
	if e != nil {
		return e
	}
	meta := &ObjectMeta{NextTimeout: s.value.NextTimeout}
	base := new(period.WorkingPeriod[ObjectMeta])
	if e := base.RestoreCoreState(core, meta, moments); e != nil {
		return e
	}
	*p = ObjectPeriod{WorkingPeriod: base, MaxLifetime: s.value.MaxLifetime}
	return nil
}
