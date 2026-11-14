package synthetic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const SlainStateType = "synthetic.SlainDetective"
const SlainStateVersion uint32 = 1

// SlainState owns zone state and references to canonical shared Damage values.
// It is not another damage registry. Capture/resolve callbacks must use the SAME
// graph as event buffers and ranking indexes. No Damage copies are embedded.
type SlainState struct {
	location   zoner.State
	references map[guid.GUID]string
}
type slainValue struct {
	LocationVersion uint32               `json:"location_version"`
	Location        json.RawMessage      `json:"location"`
	Damage          map[guid.GUID]string `json:"damage"`
}

func (s *SlainDetective) CaptureState(capture func(guid.GUID, *messages.Damage) (string, error)) (SlainState, error) {
	if s.currentZone == nil {
		return SlainState{}, fmt.Errorf("missing slain zone")
	}
	refs, err := s.CaptureLastDamageReferences(capture)
	if err != nil {
		return SlainState{}, err
	}
	return SlainState{location: s.currentZone.CaptureState(), references: refs}, nil
}
func (s SlainState) Encode() ([]byte, error) {
	location, err := s.location.Encode()
	if err != nil {
		return nil, err
	}
	return json.Marshal(slainValue{LocationVersion: zoner.StateVersion, Location: location, Damage: s.references})
}
func DecodeSlainState(version uint32, payload []byte) (SlainState, error) {
	if version != SlainStateVersion {
		return SlainState{}, fmt.Errorf("unsupported slain version %d", version)
	}
	var v slainValue
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return SlainState{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return SlainState{}, fmt.Errorf("trailing slain state")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return SlainState{}, err
	}
	if _, ok := fields["damage"]; !ok {
		return SlainState{}, fmt.Errorf("missing slain damage references")
	}
	location, err := zoner.DecodeState(v.LocationVersion, v.Location)
	if err != nil {
		return SlainState{}, err
	}
	for _, p := range v.Damage {
		if p == "" {
			return SlainState{}, fmt.Errorf("empty slain damage reference")
		}
	}
	return SlainState{location: location, references: v.Damage}, nil
}
func (s SlainState) Restore(resolve func(string) (*messages.Damage, error)) (*SlainDetective, error) {
	return NewSlainDetectiveFromReferences(s.location.Restore(), s.references, resolve)
}
