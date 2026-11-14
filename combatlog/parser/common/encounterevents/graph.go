package encounterevents

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// RegisterGraphOwners registers event buffers, not the surrounding encounter or
// its hooks. Pending Damage references belong to the shared owner graph; eager
// and finalized streams retain their existing encoded bytes.
func RegisterGraphOwners(r *ownergraph.Registry) error {
	if err := ownergraph.Register(r, ownergraph.Codec[EncounterEventsInProgress]{
		Type: EncounterEventsStateType, Version: EncounterEventsStateVersion,
		Init: func() *EncounterEventsInProgress { return new(EncounterEventsInProgress) },
		Capture: func(e *EncounterEventsInProgress, c *ownergraph.Capture) ([]byte, error) {
			state, err := e.CaptureState(func(_ int, d *messages.Damage) (string, error) { return c.Ref(d) })
			if err != nil {
				return nil, err
			}
			return state.Encode()
		},
		Restore: func(e *EncounterEventsInProgress, version uint32, payload []byte, c *ownergraph.Restore) error {
			state, err := DecodeEncounterEventsState(version, payload)
			if err != nil {
				return err
			}
			fresh, err := state.Restore(ownergraph.Loader[*messages.Damage](c))
			if err != nil {
				return err
			}
			*e = *fresh
			return nil
		},
	}); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[Events]{
		Type: EventsStateType, Version: EventsStateVersion,
		Init: func() *Events { return new(Events) },
		Capture: func(e *Events, _ *ownergraph.Capture) ([]byte, error) {
			state, err := e.CaptureState()
			if err != nil {
				return nil, err
			}
			return state.Encode()
		},
		Restore: func(e *Events, version uint32, payload []byte, _ *ownergraph.Restore) error {
			state, err := DecodeEventsState(version, payload)
			if err != nil {
				return err
			}
			fresh, err := state.Restore()
			if err != nil {
				return err
			}
			*e = *fresh
			return nil
		},
	})
}
