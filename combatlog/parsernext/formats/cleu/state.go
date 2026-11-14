package cleu

import (
	"encoding/json"
	"fmt"
	"slices"
)

// State contains decoder semantics only. Hooks are runtime dependencies.
type State struct{ Context Context }

func (d *Decoder) CaptureState() State {
	c := d.context
	c.Flavor = slices.Clone(c.Flavor)
	return State{Context: c}
}

// Restore deliberately installs no hooks and invokes no dependency callbacks.
func (s State) Restore() (*Decoder, error) {
	c := s.Context
	c.Flavor = slices.Clone(c.Flavor)
	return NewDecoder(c, Hooks{})
}

const StateVersion = 1

func (s State) Encode() ([]byte, error) {
	if _, err := s.Restore(); err != nil {
		return nil, err
	}
	return json.Marshal(s)
}

func DecodeState(version int, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported decoder state version %d", version)
	}
	var state State
	if err := DecodeStateValue(payload, &state); err != nil {
		return State{}, err
	}
	if _, err := state.Restore(); err != nil {
		return State{}, err
	}
	return state, nil
}
