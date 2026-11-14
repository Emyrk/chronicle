package instances

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

type unitTelemetryGraphValue struct {
	State      json.RawMessage `json:"state"`
	Characters string          `json:"characters"`
}

// RegisterUnitTelemetryGraphOwner restores only semantic state. Its enclosing
// owner must validate the callback requirement before explicitly wiring runtime.
func RegisterUnitTelemetryGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[UnitTelemetryEmitter]{
		Type: UnitTelemetryEmitterStateType, Version: UnitTelemetryEmitterStateVersion,
		Init: func() *UnitTelemetryEmitter { return new(UnitTelemetryEmitter) },
		Capture: func(e *UnitTelemetryEmitter, ctx *ownergraph.Capture) ([]byte, error) {
			state, err := e.CaptureState()
			if err != nil {
				return nil, err
			}
			data, err := state.Encode()
			if err != nil {
				return nil, err
			}
			var ref string
			if e.characters != nil {
				ref, err = ctx.Ref(e.characters)
				if err != nil {
					return nil, err
				}
			}
			return json.Marshal(unitTelemetryGraphValue{State: data, Characters: ref})
		},
		Restore: func(e *UnitTelemetryEmitter, version uint32, data []byte, ctx *ownergraph.Restore) error {
			var v unitTelemetryGraphValue
			if err := decodeLeafValue(data, &v); err != nil {
				return err
			}
			state, err := DecodeUnitTelemetryEmitterState(version, v.State)
			if err != nil {
				return err
			}
			if state.value.HasCharacters != (v.Characters != "") {
				return fmt.Errorf("telemetry character reference presence mismatch")
			}
			var chars *characters.Characters
			if v.Characters != "" {
				chars, err = ownergraph.ResolveAs[*characters.Characters](ctx, v.Characters)
				if err != nil {
					return err
				}
			}
			return e.RestoreSemanticState(state, chars)
		},
	})
}
