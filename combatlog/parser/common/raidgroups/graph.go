package raidgroups

import "github.com/Emyrk/chronicle/internal/stategraph/ownergraph"

func RegisterGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Tracker]{
		Type: StateType, Version: StateVersion,
		Init: func() *Tracker { return new(Tracker) },
		Capture: func(t *Tracker, _ *ownergraph.Capture) ([]byte, error) {
			state, err := t.CaptureState()
			if err != nil {
				return nil, err
			}
			return state.Encode()
		},
		Restore: func(t *Tracker, version uint32, payload []byte, _ *ownergraph.Restore) error {
			state, err := DecodeState(version, payload)
			if err != nil {
				return err
			}
			fresh, err := state.Restore()
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		},
	})
}
