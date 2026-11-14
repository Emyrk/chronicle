package consumeevidence

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const collectorGraphVersion uint32 = 1

type GraphOptions struct {
	Catalog ConsumableCatalog
}

type collectorGraphState struct {
	Auras        string          `json:"auras"`
	Shared       string          `json:"shared"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

func RegisterGraphOwners(r *ownergraph.Registry, options GraphOptions) error {
	if options.Catalog != nil {
		return fmt.Errorf("consume evidence graph snapshots do not support non-default catalogs without session compatibility metadata")
	}
	if err := ownergraph.Register(r, ownergraph.Codec[Tracker]{
		Type: TrackerStateType, Version: TrackerStateVersion,
		Init: func() *Tracker { return new(Tracker) },
		Capture: func(t *Tracker, c *ownergraph.Capture) ([]byte, error) {
			if t.catalog != nil {
				return nil, fmt.Errorf("consume evidence graph snapshots do not support non-default catalogs without session compatibility metadata")
			}
			state, err := t.CaptureState(ownergraph.Reference[*chrondbc.Spell](c))
			if err != nil {
				return nil, err
			}
			return state.Encode()
		},
		Restore: func(t *Tracker, version uint32, payload []byte, c *ownergraph.Restore) error {
			state, err := DecodeTrackerState(version, payload)
			if err != nil {
				return err
			}
			fresh, err := state.Restore(options.Catalog, ownergraph.Loader[*chrondbc.Spell](c))
			if err != nil {
				return err
			}
			*t = *fresh
			return nil
		},
	}); err != nil {
		return err
	}
	return ownergraph.Register(r, ownergraph.Codec[Collector]{
		Type: CollectorStateType, Version: collectorGraphVersion,
		Init: func() *Collector { return new(Collector) },
		Capture: func(collector *Collector, c *ownergraph.Capture) ([]byte, error) {
			auraTracker, err := c.Ref(collector.auraTracker)
			if err != nil {
				return nil, err
			}
			shared, err := c.Ref(collector.shared)
			if err != nil {
				return nil, err
			}
			state, err := collector.CaptureState(ownergraph.Reference[*chrondbc.Spell](c))
			if err != nil {
				return nil, err
			}
			payload, err := state.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(collectorGraphState{Auras: auraTracker, Shared: shared, StateVersion: CollectorStateVersion, State: payload})
		},
		Restore: func(collector *Collector, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != collectorGraphVersion {
				return fmt.Errorf("unsupported consume evidence collector graph version %d", version)
			}
			var value collectorGraphState
			if err := decodeCollectorGraphState(payload, &value); err != nil {
				return err
			}
			auraTracker, err := ownergraph.LoadAs[*auras.Tracking](c, value.Auras)
			if err != nil {
				return err
			}
			shared, err := ownergraph.LoadAs[*Tracker](c, value.Shared)
			if err != nil {
				return err
			}
			state, err := DecodeCollectorState(value.StateVersion, value.State)
			if err != nil {
				return err
			}
			fresh, err := state.Restore(auraTracker, shared, ownergraph.Loader[*chrondbc.Spell](c))
			if err != nil {
				return err
			}
			*collector = *fresh
			return nil
		},
		Validate: func(collector *Collector) error {
			if collector.auraTracker == nil || collector.shared == nil {
				return fmt.Errorf("consume evidence collector requires canonical trackers")
			}
			if collector.emit != nil {
				return fmt.Errorf("consume evidence callback requires separate runtime wiring")
			}
			return nil
		},
	})
}

func decodeCollectorGraphState(payload []byte, value *collectorGraphState) error {
	if err := validateStateJSON(payload, "consume evidence collector graph", []string{"auras", "shared", "state_version", "state"}); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if value.Auras == "" || value.Shared == "" || !json.Valid(value.State) {
		return fmt.Errorf("invalid consume evidence collector graph dependencies")
	}
	return nil
}

func (c *Collector) GraphAuras() *auras.Tracking { return c.auraTracker }
func (c *Collector) GraphShared() *Tracker       { return c.shared }

func (c *Collector) WireGraphRuntime(emit func(*messages.Consume)) { c.SetEmit(emit) }
