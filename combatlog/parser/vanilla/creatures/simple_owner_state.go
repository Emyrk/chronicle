package creatures

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"reflect"
)

const CritterStateType = "vanilla.Critter"
const CritterStateVersion uint32 = 1

type CritterState struct{ base characters.NeverActiveState }

func (c *Critter) CaptureState() (CritterState, error) {
	if c == nil {
		return CritterState{}, fmt.Errorf("nil Critter")
	}
	return CritterState{c.NeverActive.CaptureState()}, nil
}
func (s CritterState) Encode() ([]byte, error) { return s.base.Encode() }
func DecodeCritterState(version uint32, payload []byte) (CritterState, error) {
	if version != CritterStateVersion {
		return CritterState{}, fmt.Errorf("unsupported Critter version")
	}
	base, e := characters.DecodeNeverActiveState(characters.NeverActiveStateVersion, payload)
	return CritterState{base}, e
}
func (c *Critter) RestoreState(s CritterState) error {
	if c == nil {
		return fmt.Errorf("nil Critter destination")
	}
	var base characters.NeverActive
	if e := base.RestoreState(s.base); e != nil {
		return e
	}
	*c = Critter{NeverActive: base}
	return nil
}

const DiscipleOfNaralexStateType = "vanilla.DiscipleOfNaralex"
const DiscipleOfNaralexStateVersion uint32 = 1

type DiscipleOfNaralexState struct{ base characters.NeverActiveState }

func (c *DiscipleOfNaralex) CaptureState() (DiscipleOfNaralexState, error) {
	if c == nil {
		return DiscipleOfNaralexState{}, fmt.Errorf("nil DiscipleOfNaralex")
	}
	return DiscipleOfNaralexState{c.NeverActive.CaptureState()}, nil
}
func (s DiscipleOfNaralexState) Encode() ([]byte, error) { return s.base.Encode() }
func DecodeDiscipleOfNaralexState(version uint32, payload []byte) (DiscipleOfNaralexState, error) {
	if version != DiscipleOfNaralexStateVersion {
		return DiscipleOfNaralexState{}, fmt.Errorf("unsupported DiscipleOfNaralex version")
	}
	base, e := characters.DecodeNeverActiveState(characters.NeverActiveStateVersion, payload)
	return DiscipleOfNaralexState{base}, e
}
func (c *DiscipleOfNaralex) RestoreState(s DiscipleOfNaralexState) error {
	if c == nil {
		return fmt.Errorf("nil DiscipleOfNaralex destination")
	}
	var base characters.NeverActive
	if e := base.RestoreState(s.base); e != nil {
		return e
	}
	*c = DiscipleOfNaralex{NeverActive: base}
	return nil
}

const ArchmageArugalStateType = "vanilla.ArchmageArugal"
const ArchmageArugalStateVersion uint32 = 1

type ArchmageArugalState struct{ value archmageArugalValue }
type archmageArugalValue struct {
	Wrapped string `json:"wrapped"`
}

func InitArchmageArugal() *archmageArugal { return new(archmageArugal) }
func nilCharacterBase(c characters.CharacterBase) bool {
	v := reflect.ValueOf(c)
	return !v.IsValid() || (v.Kind() == reflect.Pointer && v.IsNil())
}
func (c *archmageArugal) CaptureState(capture func(characters.CharacterBase) (string, error)) (ArchmageArugalState, error) {
	if c == nil || nilCharacterBase(c.CharacterBase) || capture == nil {
		return ArchmageArugalState{}, fmt.Errorf("missing Arugal dependencies")
	}
	ref, e := capture(c.CharacterBase)
	if e != nil {
		return ArchmageArugalState{}, e
	}
	if ref == "" {
		return ArchmageArugalState{}, fmt.Errorf("empty wrapped reference")
	}
	return ArchmageArugalState{archmageArugalValue{ref}}, nil
}
func (s ArchmageArugalState) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeArchmageArugalState(version uint32, payload []byte) (ArchmageArugalState, error) {
	if version != ArchmageArugalStateVersion {
		return ArchmageArugalState{}, fmt.Errorf("unsupported Arugal version")
	}
	var v archmageArugalValue
	if e := decodeCreatureValue(payload, &v); e != nil {
		return ArchmageArugalState{}, e
	}
	if v.Wrapped == "" {
		return ArchmageArugalState{}, fmt.Errorf("empty wrapped reference")
	}
	return ArchmageArugalState{v}, nil
}
func (c *archmageArugal) RestoreState(s ArchmageArugalState, resolve func(string) (characters.CharacterBase, error)) error {
	if c == nil || resolve == nil || s.value.Wrapped == "" {
		return fmt.Errorf("missing Arugal destination/dependencies")
	}
	base, e := resolve(s.value.Wrapped)
	if e != nil {
		return e
	}
	if nilCharacterBase(base) {
		return fmt.Errorf("nil wrapped character")
	}
	*c = archmageArugal{CharacterBase: base}
	return nil
}
