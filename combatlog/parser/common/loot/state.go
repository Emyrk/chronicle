package loot

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"io"
)

const TrackerStateType = "loot.LootTracker"
const TrackerStateVersion uint32 = 1

// TrackerState retains observation identities, not copies of shared observations.
// Units and observations are resolved by the enclosing graph.
type TrackerState struct{ loot []string }

func (t *LootTracker) CaptureState(ref func(*FinalLoot) (string, error)) (TrackerState, error) {
	if t == nil || t.units == nil || ref == nil {
		return TrackerState{}, fmt.Errorf("incomplete loot tracker dependencies")
	}
	var paths []string
	if t.loot != nil {
		paths = make([]string, 0, len(t.loot))
	}
	for _, drop := range t.loot {
		if drop == nil {
			return TrackerState{}, fmt.Errorf("nil loot observation")
		}
		path, err := ref(drop)
		if err != nil {
			return TrackerState{}, err
		}
		if path == "" {
			return TrackerState{}, fmt.Errorf("empty loot reference")
		}
		paths = append(paths, path)
	}
	return TrackerState{paths}, nil
}
func (s TrackerState) Encode() ([]byte, error) {
	for _, p := range s.loot {
		if p == "" {
			return nil, fmt.Errorf("empty loot reference")
		}
	}
	return json.Marshal(struct {
		Loot []string `json:"loot"`
	}{s.loot})
}
func DecodeTrackerState(version uint32, b []byte) (TrackerState, error) {
	if version != TrackerStateVersion {
		return TrackerState{}, fmt.Errorf("unsupported loot tracker version %d", version)
	}
	if err := validateFields(b, "loot"); err != nil {
		return TrackerState{}, err
	}
	var value struct {
		Loot []string `json:"loot"`
	}
	if err := json.Unmarshal(b, &value); err != nil {
		return TrackerState{}, err
	}
	s := TrackerState{value.Loot}
	if _, err := s.Encode(); err != nil {
		return TrackerState{}, err
	}
	return s, nil
}
func (s TrackerState) Restore(units *unitdb.Units, load func(string) (*FinalLoot, error)) (*LootTracker, error) {
	if units == nil || load == nil {
		return nil, fmt.Errorf("incomplete loot restore dependencies")
	}
	t := New(units)
	if s.loot != nil {
		t.loot = make([]*FinalLoot, 0, len(s.loot))
	}
	for _, path := range s.loot {
		if path == "" {
			return nil, fmt.Errorf("empty loot reference")
		}
		drop, err := load(path)
		if err != nil {
			return nil, err
		}
		if drop == nil {
			return nil, fmt.Errorf("nil loot observation")
		}
		t.loot = append(t.loot, drop)
	}
	return t, nil
}

// validateFields enforces a closed object schema, including duplicate rejection.
func validateFields(b []byte, names ...string) error {
	d := json.NewDecoder(bytes.NewReader(b))
	tok, err := d.Token()
	if err != nil {
		return err
	}
	if tok != json.Delim('{') {
		return fmt.Errorf("loot state must be an object")
	}
	seen := map[string]bool{}
	for d.More() {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		name := tok.(string)
		if seen[name] {
			return fmt.Errorf("duplicate loot field %q", name)
		}
		seen[name] = true
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return err
		}
		if name != "loot" && bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return fmt.Errorf("null loot field %q", name)
		}
	}
	if _, err := d.Token(); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing loot state")
	}
	if len(seen) != len(names) {
		return fmt.Errorf("invalid loot fields")
	}
	for _, name := range names {
		if !seen[name] {
			return fmt.Errorf("missing loot field %q", name)
		}
	}
	return nil
}
