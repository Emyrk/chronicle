package unitdb

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const StateType = "unitdb.Units"
const StateVersion uint32 = 1

// State is a detached owner-local value. Possession spells refer to the caller's
// existing derivable graph; this owner neither serializes spells nor resolves IDs.
// Restore produces one Units candidate for all consumers to share.
type State struct{ value stateValue }
type stateValue struct {
	Info                 map[guid.GUID]unitinfo.Info       `json:"info"`
	Players              map[guid.GUID]combatant.Combatant `json:"players"`
	PlayerByName         map[string]guid.GUID              `json:"player_by_name"`
	Possessed            map[guid.GUID]possessionValue     `json:"possessed"`
	InjectedAffiliations map[guid.GUID]Affiliation         `json:"injected_affiliations"`
	DirectOwners         map[guid.GUID]guid.GUID           `json:"direct_owners"`
}
type possessionValue struct {
	Controller guid.GUID `json:"controller"`
	SpellPath  string    `json:"spell_path"`
	StartTime  time.Time `json:"start_time"`
	ExpiresAt  time.Time `json:"expires_at"`
}

func cloneInfo(v unitinfo.Info) unitinfo.Info {
	if v.Owner != nil {
		owner := *v.Owner
		v.Owner = &owner
	}
	if v.Charm != nil {
		charm := *v.Charm
		v.Charm = &charm
	}
	v.Buffs = slices.Clone(v.Buffs)
	v.Challenges = slices.Clone(v.Challenges)
	return v
}
func (v stateValue) clone() stateValue {
	v.Info = maps.Clone(v.Info)
	for id, info := range v.Info {
		v.Info[id] = cloneInfo(info)
	}
	v.Players = maps.Clone(v.Players)
	for id, player := range v.Players {
		v.Players[id] = player.Clone()
	}
	v.PlayerByName = maps.Clone(v.PlayerByName)
	v.Possessed = maps.Clone(v.Possessed)
	v.InjectedAffiliations = maps.Clone(v.InjectedAffiliations)
	v.DirectOwners = maps.Clone(v.DirectOwners)
	return v
}

// CaptureState preserves all six maps, including nil versus empty, historical
// name aliases and direct versus flattened owners. It does not expire possession
// or recompute relationships. Capture callbacks register existing spell references.
func (us *Units) CaptureState(capture func(*chrondbc.Spell) (string, error)) (State, error) {
	if us == nil {
		return State{}, fmt.Errorf("nil units")
	}
	v := stateValue{Info: us.Info, Players: us.Players, PlayerByName: us.PlayerByName, InjectedAffiliations: us.injectedAffiliations, DirectOwners: us.directOwners}
	if us.Possessed != nil {
		v.Possessed = make(map[guid.GUID]possessionValue, len(us.Possessed))
	}
	// Stable callback ordering makes the enclosing graph independent of map order.
	for _, id := range slices.Sorted(maps.Keys(us.Possessed)) {
		p := us.Possessed[id]
		var path string
		if p.Spell != nil {
			if capture == nil {
				return State{}, fmt.Errorf("missing possession spell capture")
			}
			var err error
			path, err = capture(p.Spell)
			if err != nil {
				return State{}, err
			}
			if path == "" {
				return State{}, fmt.Errorf("empty possession spell reference")
			}
		}
		v.Possessed[id] = possessionValue{p.Controller, path, p.StartTime, p.ExpiresAt}
	}
	return State{v.clone()}, nil
}
func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }

func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported units state version %d", version)
	}
	var v stateValue
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&v); err != nil {
		return State{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return State{}, fmt.Errorf("trailing units state")
	}
	// Every field is emitted, including explicit null pointers/maps/slices. Compare
	// JSON trees after typed decoding to reject missing fields, scalar nulls, short
	// fixed arrays, case-folded field names, and nested truncation. No runtime object
	// reflection, schema registry, or semantic ownership normalization is involved.
	encoded, err := json.Marshal(v)
	if err != nil {
		return State{}, err
	}
	original, err := stateJSON(payload)
	if err != nil {
		return State{}, err
	}
	canonical, err := stateJSON(encoded)
	if err != nil {
		return State{}, err
	}
	if !bytes.Equal(original, canonical) {
		return State{}, fmt.Errorf("incomplete or noncanonical units state")
	}
	return State{v}, nil
}

// stateJSON orders object keys and ignores whitespace while rejecting duplicates.
// UseNumber prevents integer precision loss in GUIDs and metadata values.
func stateJSON(payload []byte) ([]byte, error) {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.UseNumber()
	var read func() (any, error)
	read = func() (any, error) {
		token, err := d.Token()
		if err != nil {
			return nil, err
		}
		switch token {
		case json.Delim('{'):
			value := make(map[string]any)
			for d.More() {
				keyToken, err := d.Token()
				if err != nil {
					return nil, err
				}
				key, ok := keyToken.(string)
				if !ok {
					return nil, fmt.Errorf("non-string state key")
				}
				if _, exists := value[key]; exists {
					return nil, fmt.Errorf("duplicate state key %q", key)
				}
				child, err := read()
				if err != nil {
					return nil, err
				}
				value[key] = child
			}
			if _, err := d.Token(); err != nil {
				return nil, err
			}
			return value, nil
		case json.Delim('['):
			value := make([]any, 0)
			for d.More() {
				child, err := read()
				if err != nil {
					return nil, err
				}
				value = append(value, child)
			}
			if _, err := d.Token(); err != nil {
				return nil, err
			}
			return value, nil
		default:
			return token, nil
		}
	}
	value, err := read()
	if err != nil {
		return nil, err
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, fmt.Errorf("trailing state JSON")
	}
	return json.Marshal(value)
}

// Restore never calls Update, flattenOwners or expiry: those are later message
// transitions. A missing/broken reference rejects the entire fresh candidate.
func (s State) Restore(resolve func(string) (*chrondbc.Spell, error)) (*Units, error) {
	v := s.value.clone()
	us := &Units{Info: v.Info, Players: v.Players, PlayerByName: v.PlayerByName, injectedAffiliations: v.InjectedAffiliations, directOwners: v.DirectOwners}
	if v.Possessed != nil {
		us.Possessed = make(map[guid.GUID]PossessionState, len(v.Possessed))
	}
	for _, id := range slices.Sorted(maps.Keys(v.Possessed)) {
		p := v.Possessed[id]
		var spell *chrondbc.Spell
		if p.SpellPath != "" {
			if resolve == nil {
				return nil, fmt.Errorf("missing possession spell resolver")
			}
			var err error
			spell, err = resolve(p.SpellPath)
			if err != nil {
				return nil, err
			}
			if spell == nil {
				return nil, fmt.Errorf("nil resolved possession spell")
			}
		}
		us.Possessed[id] = PossessionState{p.Controller, spell, p.StartTime, p.ExpiresAt}
	}
	return us, nil
}
