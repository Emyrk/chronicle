package zoner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

const StateVersion uint32 = 1

// State is the complete detached Location value, including whether authoritative
// zone metadata has ever been seen. Its pointer is private and copied on restore.
type State struct{ value locationValue }
type locationValue struct {
	Zone      zone.Zone `json:"zone"`
	Synthetic *bool     `json:"synthetic"`
}

func (l *Location) CaptureState() State {
	s := State{value: locationValue{Zone: l.Zone}}
	if l.synthetic != nil {
		v := *l.synthetic
		s.value.Synthetic = &v
	}
	return s
}
func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported location version %d", version)
	}
	var v locationValue
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return State{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return State{}, fmt.Errorf("trailing location state")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return State{}, err
	}
	if _, ok := fields["synthetic"]; !ok {
		return State{}, fmt.Errorf("missing synthetic origin")
	}
	if raw, ok := fields["zone"]; !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return State{}, fmt.Errorf("missing or null zone")
	}
	// Zone consists entirely of values. Require every current field so a truncated
	// object does not silently restore a different zone/difficulty.
	var zoneFields map[string]json.RawMessage
	if err := json.Unmarshal(fields["zone"], &zoneFields); err != nil {
		return State{}, err
	}
	expected, _ := json.Marshal(zone.Zone{})
	var required map[string]json.RawMessage
	if err := json.Unmarshal(expected, &required); err != nil {
		return State{}, err
	}
	for key := range required {
		if raw, ok := zoneFields[key]; !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return State{}, fmt.Errorf("missing or null zone field %s", key)
		}
	}
	return State{value: v}, nil
}
func (s State) Restore() *Location {
	l := &Location{Zone: s.value.Zone}
	if s.value.Synthetic != nil {
		v := *s.value.Synthetic
		l.synthetic = &v
	}
	return l
}
