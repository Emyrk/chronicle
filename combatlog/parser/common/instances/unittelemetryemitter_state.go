package instances

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"maps"
)

const UnitTelemetryEmitterStateType = "instances.UnitTelemetryEmitter"
const UnitTelemetryEmitterStateVersion uint32 = 1

type UnitTelemetryEmitterState struct{ value unitTelemetryValue }
type unitTelemetryValue struct {
	Positions       map[guid.GUID]positionValue `json:"positions"`
	Resources       map[guid.GUID]resourceValue `json:"resources"`
	Dead            map[guid.GUID]struct{}      `json:"dead"`
	FightActive     bool                        `json:"fight_active"`
	EmittedPosition map[guid.GUID]struct{}      `json:"emitted_position"`
	EmittedResource map[guid.GUID]struct{}      `json:"emitted_resource"`
	HasCharacters   bool                        `json:"has_characters"`
	HasEmitter      bool                        `json:"has_emitter"`
}

func telemetryCopy[T any](v *T) *T {
	if v == nil {
		return nil
	}
	c := *v
	return &c
}

type positionValue struct {
	Base      messages.MessageBaseState `json:"base"`
	Unit      guid.GUID                 `json:"Unit"`
	X         float64                   `json:"X"`
	Y         float64                   `json:"Y"`
	Z         *float64                  `json:"Z"`
	MapID     int32                     `json:"MapID"`
	Floor     *int32                    `json:"Floor"`
	Facing    float64                   `json:"Facing"`
	HasFacing bool                      `json:"HasFacing"`
}

func captureTelemetryUnitPosition(m messages.UnitPosition) positionValue {
	return positionValue{Base: m.CaptureState(), Unit: m.Unit, X: m.X, Y: m.Y, Z: telemetryCopy(m.Z), MapID: m.MapID, Floor: telemetryCopy(m.Floor), Facing: m.Facing, HasFacing: m.HasFacing}
}
func (v positionValue) restore() messages.UnitPosition {
	return messages.UnitPosition{MessageBase: v.Base.Restore(), Unit: v.Unit, X: v.X, Y: v.Y, Z: telemetryCopy(v.Z), MapID: v.MapID, Floor: telemetryCopy(v.Floor), Facing: v.Facing, HasFacing: v.HasFacing}
}

type resourceValue struct {
	Base             messages.MessageBaseState `json:"base"`
	Unit             guid.GUID                 `json:"Unit"`
	CurrentHealth    int64                     `json:"CurrentHealth"`
	MaximumHealth    int64                     `json:"MaximumHealth"`
	Absorb           int32                     `json:"Absorb"`
	PowerType        types.Resource            `json:"PowerType"`
	CurrentPower     int32                     `json:"CurrentPower"`
	MaximumPower     int32                     `json:"MaximumPower"`
	AttackPower      int32                     `json:"AttackPower"`
	SpellPower       int32                     `json:"SpellPower"`
	Armor            int32                     `json:"Armor"`
	UnitLevel        *int32                    `json:"UnitLevel"`
	AverageItemLevel *int32                    `json:"AverageItemLevel"`
}

func captureTelemetryUnitResources(m messages.UnitResources) resourceValue {
	return resourceValue{Base: m.CaptureState(), Unit: m.Unit, CurrentHealth: m.CurrentHealth, MaximumHealth: m.MaximumHealth, Absorb: m.Absorb, PowerType: m.PowerType, CurrentPower: m.CurrentPower, MaximumPower: m.MaximumPower, AttackPower: m.AttackPower, SpellPower: m.SpellPower, Armor: m.Armor, UnitLevel: telemetryCopy(m.UnitLevel), AverageItemLevel: telemetryCopy(m.AverageItemLevel)}
}
func (v resourceValue) restore() messages.UnitResources {
	return messages.UnitResources{MessageBase: v.Base.Restore(), Unit: v.Unit, CurrentHealth: v.CurrentHealth, MaximumHealth: v.MaximumHealth, Absorb: v.Absorb, PowerType: v.PowerType, CurrentPower: v.CurrentPower, MaximumPower: v.MaximumPower, AttackPower: v.AttackPower, SpellPower: v.SpellPower, Armor: v.Armor, UnitLevel: telemetryCopy(v.UnitLevel), AverageItemLevel: telemetryCopy(v.AverageItemLevel)}
}
func (v unitTelemetryValue) validate() error {
	if v.Positions == nil || v.Resources == nil || v.Dead == nil || v.EmittedPosition == nil || v.EmittedResource == nil {
		return fmt.Errorf("uninitialized telemetry maps")
	}
	for id, p := range v.Positions {
		if !p.Base.MarksPresent && p.Base.Marks != nil {
			return fmt.Errorf("inconsistent cached message marks")
		}
		if id != p.Unit {
			return fmt.Errorf("position identity mismatch")
		}
	}
	for id, p := range v.Resources {
		if !p.Base.MarksPresent && p.Base.Marks != nil {
			return fmt.Errorf("inconsistent cached message marks")
		}
		if id != p.Unit {
			return fmt.Errorf("resource identity mismatch")
		}
	}
	return nil
}
func (e *UnitTelemetryEmitter) CaptureState() (UnitTelemetryEmitterState, error) {
	if e == nil || e.positions == nil || e.resources == nil {
		return UnitTelemetryEmitterState{}, fmt.Errorf("nil telemetry owner/cache")
	}
	v := unitTelemetryValue{Positions: make(map[guid.GUID]positionValue, len(e.positions)), Resources: make(map[guid.GUID]resourceValue, len(e.resources)), Dead: maps.Clone(e.dead), FightActive: e.fightActive, EmittedPosition: maps.Clone(e.emittedPosition), EmittedResource: maps.Clone(e.emittedResource), HasCharacters: e.characters != nil, HasEmitter: e.emit != nil}
	for id, m := range e.positions {
		v.Positions[id] = captureTelemetryUnitPosition(m)
	}
	for id, m := range e.resources {
		v.Resources[id] = captureTelemetryUnitResources(m)
	}
	if err := v.validate(); err != nil {
		return UnitTelemetryEmitterState{}, err
	}
	return UnitTelemetryEmitterState{v}, nil
}
func (s UnitTelemetryEmitterState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeUnitTelemetryEmitterState(version uint32, payload []byte) (UnitTelemetryEmitterState, error) {
	if version != UnitTelemetryEmitterStateVersion {
		return UnitTelemetryEmitterState{}, fmt.Errorf("unsupported telemetry version")
	}
	var v unitTelemetryValue
	if err := decodeLeafValue(payload, &v); err != nil {
		return UnitTelemetryEmitterState{}, err
	}
	if err := v.validate(); err != nil {
		return UnitTelemetryEmitterState{}, err
	}
	return UnitTelemetryEmitterState{v}, nil
}

// RestoreState copies value snapshots, including private MessageBase state, and
// injects the canonical lookup/emitter without calling either. No hook registration
// or format selection occurs here; existing V22-only Hookable wiring is unchanged.
func (e *UnitTelemetryEmitter) RestoreState(s UnitTelemetryEmitterState, chars *characters.Characters, emit func(messages.Message)) error {
	if e == nil {
		return fmt.Errorf("nil telemetry destination")
	}
	v := s.value
	if err := v.validate(); err != nil {
		return err
	}
	if v.HasCharacters != (chars != nil) || v.HasEmitter != (emit != nil) {
		return fmt.Errorf("telemetry dependency presence mismatch")
	}
	positions := make(map[guid.GUID]messages.UnitPosition, len(v.Positions))
	resources := make(map[guid.GUID]messages.UnitResources, len(v.Resources))
	for id, p := range v.Positions {
		positions[id] = p.restore()
	}
	for id, p := range v.Resources {
		resources[id] = p.restore()
	}
	*e = UnitTelemetryEmitter{characters: chars, emit: emit, positions: positions, resources: resources, dead: maps.Clone(v.Dead), fightActive: v.FightActive, emittedPosition: maps.Clone(v.EmittedPosition), emittedResource: maps.Clone(v.EmittedResource)}
	return nil
}
