package synthetic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const VanillaPlusStateVersion uint32 = 1

// VanillaPlusState copies observed primary GUID values at a complete-file
// boundary. The live algorithm still aliases Unit.Guid; no later production
// writes to that field were observed. Fixed boss rules and flavor enablement
// belong to the enclosing compatibility identity, not serialized mutable state.
type VanillaPlusState struct{ boss map[uint32]*guid.GUID }

func (v *vanillaplus) CaptureState() VanillaPlusState {
	s := VanillaPlusState{boss: make(map[uint32]*guid.GUID, len(v.boss))}
	for entry, id := range v.boss {
		if id == nil {
			s.boss[entry] = nil
		} else {
			copy := *id
			s.boss[entry] = &copy
		}
	}
	return s
}
func (s VanillaPlusState) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Boss map[uint32]*guid.GUID `json:"boss"`
	}{s.boss})
}
func DecodeVanillaPlusState(version uint32, payload []byte) (VanillaPlusState, error) {
	if version != VanillaPlusStateVersion {
		return VanillaPlusState{}, fmt.Errorf("unsupported VanillaPlus state version %d", version)
	}
	var v struct {
		Boss map[uint32]*guid.GUID `json:"boss"`
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return VanillaPlusState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return VanillaPlusState{}, fmt.Errorf("trailing VanillaPlus state")
	}
	s := VanillaPlusState{boss: v.Boss}
	if err := s.validate(); err != nil {
		return VanillaPlusState{}, err
	}
	return s, nil
}
func (s VanillaPlusState) validate() error {
	defaults := newVanillaPlus()
	if len(s.boss) != len(defaults.boss) {
		return fmt.Errorf("incompatible VanillaPlus primary set")
	}
	for entry, id := range s.boss {
		if _, ok := defaults.boss[entry]; !ok {
			return fmt.Errorf("unknown VanillaPlus primary %d", entry)
		}
		if id != nil {
			actual, ok := id.GetEntry()
			if !ok || actual != entry {
				return fmt.Errorf("invalid VanillaPlus primary GUID")
			}
		}
	}
	return nil
}
func (s VanillaPlusState) Restore() (*vanillaplus, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	v := newVanillaPlus()
	for entry, id := range s.boss {
		if id != nil {
			copy := *id
			v.boss[entry] = &copy
		}
	}
	return v, nil
}
