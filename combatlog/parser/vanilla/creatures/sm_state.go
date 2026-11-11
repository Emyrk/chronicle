package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const VanillaPlusMograineStateType = "vanilla.VanillaPlusMograine"
const VanillaPlusMograineStateVersion uint32 = 1

type VanillaPlusMograineState struct{ value vanillaPlusMograineValue }
type vanillaPlusMograineValue struct {
	Common               string `json:"common"`
	AwaitingResurrection bool   `json:"awaiting_resurrection"`
	Resurrected          bool   `json:"resurrected"`
}

func InitVanillaPlusMograine() *vanillaPlusMograineCharacter {
	return new(vanillaPlusMograineCharacter)
}
func (c *vanillaPlusMograineCharacter) CaptureState(capture func(*characters.Common) (string, error)) (VanillaPlusMograineState, error) {
	if c == nil {
		return VanillaPlusMograineState{}, fmt.Errorf("nil Mograine")
	}
	s, e := captureCommonOwner("Mograine", c.Common, capture)
	if e != nil {
		return VanillaPlusMograineState{}, e
	}
	return VanillaPlusMograineState{vanillaPlusMograineValue{s.reference, c.awaitingResurrection, c.resurrected}}, nil
}
func (s VanillaPlusMograineState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeVanillaPlusMograineState(version uint32, payload []byte) (VanillaPlusMograineState, error) {
	if version != VanillaPlusMograineStateVersion {
		return VanillaPlusMograineState{}, fmt.Errorf("unsupported Mograine version")
	}
	var v vanillaPlusMograineValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return VanillaPlusMograineState{}, e
	}
	if v.Common == "" {
		return VanillaPlusMograineState{}, fmt.Errorf("empty Common reference")
	}
	return VanillaPlusMograineState{v}, nil
}
func (c *vanillaPlusMograineCharacter) RestoreState(s VanillaPlusMograineState, resolve func(string) (*characters.Common, error)) error {
	if c == nil {
		return fmt.Errorf("nil Mograine destination")
	}
	base, e := (CommonOwnerState{owner: "Mograine", reference: s.value.Common}).resolve("Mograine", resolve)
	if e != nil {
		return e
	}
	*c = vanillaPlusMograineCharacter{Common: base, awaitingResurrection: s.value.AwaitingResurrection, resurrected: s.value.Resurrected}
	return nil
}
