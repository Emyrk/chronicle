package azerothcore

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
)

// State is the CLEU semantic metadata. ACore extensions own only trusted runtime
// callbacks (spell/gear/logger) and no mutable semantic state.
type State = cleu.State

const StateVersion = cleu.StateVersion

func (d *Decoder) CaptureState() State { return d.core.CaptureState() }
func DecodeState(version int, b []byte) (State, error) {
	s, e := cleu.DecodeState(version, b)
	if e != nil {
		return State{}, e
	}
	if s.Context.Format != database.LogFormatAzerothcoreMod {
		return State{}, fmt.Errorf("invalid ACore decoder format")
	}
	return s, nil
}
func RestoreState(s State) (*Decoder, error) {
	if s.Context.Format != database.LogFormatAzerothcoreMod {
		return nil, fmt.Errorf("invalid ACore decoder format")
	}
	core, e := s.Restore()
	if e != nil {
		return nil, e
	}
	return &Decoder{core: core}, nil
}
