package instances

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"maps"
)

const OverhealingStateType = "instances.Overhealing"
const OverhealingStateVersion uint32 = 1

type OverhealingState struct{ value overhealingValue }
type overhealingValue struct {
	Deficits map[guid.GUID]int32 `json:"deficits"`
}

func (o *Overhealing) CaptureState() (OverhealingState, error) {
	if o == nil {
		return OverhealingState{}, fmt.Errorf("nil overhealing owner")
	}
	return OverhealingState{overhealingValue{maps.Clone(o.deficits)}}, nil
}
func (s OverhealingState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeOverhealingState(version uint32, payload []byte) (OverhealingState, error) {
	if version != OverhealingStateVersion {
		return OverhealingState{}, fmt.Errorf("unsupported overhealing version")
	}
	var v overhealingValue
	if e := decodeLeafValue(payload, &v); e != nil {
		return OverhealingState{}, e
	}
	return OverhealingState{v}, nil
}

// RestoreState preserves the legitimate pre-FightStarted nil map and exact
// deficit values. It does not replay FightStarted/Ended or mutate a heal message.
func (o *Overhealing) RestoreState(s OverhealingState) error {
	if o == nil {
		return fmt.Errorf("nil overhealing destination")
	}
	*o = Overhealing{deficits: maps.Clone(s.value.Deficits)}
	return nil
}
