package raidgroups

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const StateType = "raidgroups.Tracker"
const StateVersion uint32 = 1

// State is a detached, immutable-by-API copy of tracker-owned observations.
// The enclosing parse session is responsible for capturing only at a complete
// file boundary.
type State struct{ observations []observationValue }

type observationValue struct {
	At          time.Time   `json:"at"`
	Composition Composition `json:"composition"`
}

// CaptureState preserves observation insertion order. That order is semantic
// for observations with equal timestamps because LatestAt uses a stable sort.
func (t *Tracker) CaptureState() (State, error) {
	if t == nil {
		return State{}, fmt.Errorf("nil raid-group tracker")
	}
	var observations []observationValue
	if t.observations != nil {
		observations = make([]observationValue, len(t.observations))
		for i, observation := range t.observations {
			observations[i] = observationValue(observation)
		}
	}
	return State{observations: observations}, nil
}

// Encode returns the owned value payload. Type and version belong to the
// enclosing snapshot archive.
func (s State) Encode() ([]byte, error) {
	return json.Marshal(struct {
		Observations []observationValue `json:"observations"`
	}{s.observations})
}

// DecodeState fails closed on unknown versions, fields, malformed fixed-size
// compositions, duplicate fields, and trailing data.
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported %s version %d", StateType, version)
	}
	fields, err := decodeObject(payload, "raid-group state")
	if err != nil {
		return State{}, err
	}
	if len(fields) != 1 || len(fields["observations"]) == 0 {
		return State{}, fmt.Errorf("raid-group state requires observations")
	}
	rawObservations := bytes.TrimSpace(fields["observations"])
	if bytes.Equal(rawObservations, []byte("null")) {
		return State{}, nil
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(rawObservations, &entries); err != nil {
		return State{}, fmt.Errorf("decode raid-group observations: %w", err)
	}
	observations := make([]observationValue, len(entries))
	for i, entry := range entries {
		observation, err := decodeObservation(entry)
		if err != nil {
			return State{}, fmt.Errorf("raid-group observation %d: %w", i, err)
		}
		observations[i] = observation
	}
	return State{observations: observations}, nil
}

func decodeObservation(payload []byte) (observationValue, error) {
	fields, err := decodeObject(payload, "raid-group observation")
	if err != nil {
		return observationValue{}, err
	}
	if len(fields) != 2 || len(fields["at"]) == 0 || len(fields["composition"]) == 0 {
		return observationValue{}, fmt.Errorf("observation requires at and composition")
	}
	if bytes.Equal(bytes.TrimSpace(fields["at"]), []byte("null")) || bytes.Equal(bytes.TrimSpace(fields["composition"]), []byte("null")) {
		return observationValue{}, fmt.Errorf("observation fields cannot be null")
	}
	var at time.Time
	if err := json.Unmarshal(fields["at"], &at); err != nil {
		return observationValue{}, fmt.Errorf("decode observation time: %w", err)
	}
	composition, err := decodeComposition(fields["composition"])
	if err != nil {
		return observationValue{}, err
	}
	return observationValue{At: at, Composition: composition}, nil
}

func decodeComposition(payload []byte) (Composition, error) {
	var groups []json.RawMessage
	if err := json.Unmarshal(payload, &groups); err != nil {
		return Composition{}, fmt.Errorf("decode composition: %w", err)
	}
	if len(groups) != messages.RaidGroupCount {
		return Composition{}, fmt.Errorf("composition requires %d groups", messages.RaidGroupCount)
	}
	var composition Composition
	for groupIndex, rawGroup := range groups {
		if bytes.Equal(bytes.TrimSpace(rawGroup), []byte("null")) {
			return Composition{}, fmt.Errorf("composition group %d is null", groupIndex)
		}
		var members []json.RawMessage
		if err := json.Unmarshal(rawGroup, &members); err != nil {
			return Composition{}, fmt.Errorf("decode composition group %d: %w", groupIndex, err)
		}
		if len(members) != messages.RaidGroupSize {
			return Composition{}, fmt.Errorf("composition group %d requires %d members", groupIndex, messages.RaidGroupSize)
		}
		for memberIndex, rawMember := range members {
			if bytes.Equal(bytes.TrimSpace(rawMember), []byte("null")) {
				return Composition{}, fmt.Errorf("composition group %d member %d is null", groupIndex, memberIndex)
			}
			var member guid.GUID
			if err := json.Unmarshal(rawMember, &member); err != nil {
				return Composition{}, fmt.Errorf("decode composition group %d member %d: %w", groupIndex, memberIndex, err)
			}
			composition[groupIndex][memberIndex] = member
		}
	}
	return composition, nil
}

func decodeObject(payload []byte, label string) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if token != json.Delim('{') {
		return nil, fmt.Errorf("%s must be an object", label)
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("%s field name is not a string", label)
		}
		if _, exists := fields[name]; exists {
			return nil, fmt.Errorf("duplicate %s field %q", label, name)
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		fields[name] = value
	}
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fmt.Errorf("trailing %s data", label)
	}
	return fields, nil
}

// Restore constructs a fresh tracker. Later processing cannot mutate State or
// any other tracker restored from the same State value.
func (s State) Restore() (*Tracker, error) {
	observations := make([]Observation, len(s.observations))
	for i, observation := range s.observations {
		observations[i] = Observation(observation)
	}
	if s.observations == nil {
		observations = nil
	}
	return &Tracker{observations: observations}, nil
}
