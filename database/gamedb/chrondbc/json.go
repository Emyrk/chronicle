package chrondbc

import (
	"encoding/json"
	"math/bits"
	"strings"
)

// EnumJSON is the JSON representation for enum types with String()
type EnumJSON struct {
	Value  int    `json:"value"`
	String string `json:"string"`
}

// BitmaskJSON is the JSON representation for bitmask types
type BitmaskJSON struct {
	Mask   uint32 `json:"mask"`
	String string `json:"string"`
}

// === Enums with stringer - {"value": N, "string": "..."} ===

func (s School) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(s), String: s.String()})
}

func (p Power) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(p), String: p.DisplayString()})
}

func (s SpellClassSet) MarshalJSON() ([]byte, error) {
	// SpellClassSet doesn't have stringer, use known names
	names := map[SpellClassSet]string{
		SpellClassSetGeneric:     "Generic",
		SpellClassSetMage:        "Mage",
		SpellClassSetWarrior:     "Warrior",
		SpellClassSetWarlock:     "Warlock",
		SpellClassSetPriest:      "Priest",
		SpellClassSetDruid:       "Druid",
		SpellClassSetRogue:       "Rogue",
		SpellClassSetHunter:      "Hunter",
		SpellClassSetPaladin:     "Paladin",
		SpellClassSetShaman:      "Shaman",
		SpellClassSetDeathKnight: "Death Knight",
	}
	name, ok := names[s]
	if !ok {
		name = "Unknown"
	}
	return json.Marshal(EnumJSON{Value: int(s), String: name})
}

func (d DispelType) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(d), String: d.String()})
}

func (a AuraEffect) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(a), String: a.String()})
}

func (e Effect) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(e), String: e.String()})
}

func (p PreventionType) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(p), String: p.String()})
}

func (m Mechanic) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(m), String: m.String()})
}

func (d DefenseType) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(d), String: d.String()})
}

func (a AuraState) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(a), String: a.String()})
}

func (i ImplicitTarget) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(i), String: i.String()})
}

func (e EquippedItemClass) MarshalJSON() ([]byte, error) {
	return json.Marshal(EnumJSON{Value: int(e), String: e.String()})
}

// === Bitmasks - {"mask": N, "string": "Flag1 | Flag2"} ===

// bitmaskString iterates bits from 0 to endBit and joins set flag names.
// singleStringer should return the name for a single flag value.
func bitmaskString[T ~uint32](val T, endVal T, singleStringer func(T) string) string {
	if val == 0 {
		return singleStringer(val)
	}
	endBit := bits.Len32(uint32(endVal))
	var parts []string
	for i := 0; i < endBit; i++ {
		bit := T(1 << i)
		if val&bit != 0 {
			parts = append(parts, singleStringer(bit))
		}
	}
	if len(parts) == 0 {
		return singleStringer(val) // Fallback
	}
	return strings.Join(parts, " | ")
}

func (p ProcFlags) MarshalJSON() ([]byte, error) {
	str := bitmaskString(p, ProcFlag_END, func(v ProcFlags) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(p), String: str})
}

func (p ProcFlagsEx) MarshalJSON() ([]byte, error) {
	str := bitmaskString(p, ProcEx_END, func(v ProcFlagsEx) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(p), String: str})
}

func (a AuraInterruptFlags) MarshalJSON() ([]byte, error) {
	str := bitmaskString(a, AuraInterruptFlag_END, func(v AuraInterruptFlags) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(a), String: str})
}

func (i InterruptFlags) MarshalJSON() ([]byte, error) {
	str := bitmaskString(i, InterruptFlag_END, func(v InterruptFlags) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(i), String: str})
}

func (t TargetCreatureType) MarshalJSON() ([]byte, error) {
	str := bitmaskString(t, CreatureType_END, func(v TargetCreatureType) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(t), String: str})
}

func (e EquippedItemInvTypes) MarshalJSON() ([]byte, error) {
	str := bitmaskString(e, InvType_END, func(v EquippedItemInvTypes) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(e), String: str})
}

func (t TargetFlags) MarshalJSON() ([]byte, error) {
	str := bitmaskString(t, Target_END, func(v TargetFlags) string { return v.String() })
	return json.Marshal(BitmaskJSON{Mask: uint32(t), String: str})
}

// SpellAttributesJSON is the JSON representation for spell attributes.
// Includes both the raw block values and the human-readable string representation.
type SpellAttributesJSON struct {
	Blocks [9]uint32 `json:"blocks"`
	String string    `json:"string"`
}

func (sa SpellAttributes) MarshalJSON() ([]byte, error) {
	return json.Marshal(SpellAttributesJSON{
		Blocks: sa,
		String: sa.String(),
	})
}
