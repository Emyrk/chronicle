package consumeevidence

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const collectorGraphVersion uint32 = 1

type GraphOptions struct {
	// Compatibility binds caller-supplied dependencies to authoritative session identity.
	Compatibility snapshot.Compatibility
	Catalog       ConsumableCatalog
}

type collectorGraphState struct {
	Auras        string          `json:"auras"`
	Shared       string          `json:"shared"`
	StateVersion uint32          `json:"state_version"`
	State        json.RawMessage `json:"state"`
}

func RegisterGraphOwners(r *ownergraph.Registry, options GraphOptions) error {
	bound := options.Compatibility != (snapshot.Compatibility{})
	if bound {
		if err := options.Compatibility.Validate(); err != nil {
			return err
		}
	}
	if options.Catalog != nil && !bound {
		return fmt.Errorf("configured consumeevidence dependency requires session compatibility metadata")
	}
	if options.Catalog != nil && !reflect.TypeOf(options.Catalog).Comparable() {
		return fmt.Errorf("catalog dependency must support identity comparison")
	}
	if err := ownergraph.Register(r, ownergraph.Codec[Tracker]{
		Type: TrackerStateType, Version: 2,
		Init: func() *Tracker { return new(Tracker) },
		Capture: func(t *Tracker, c *ownergraph.Capture) ([]byte, error) {
			if t.catalog != nil && !bound {
				return nil, fmt.Errorf("configured consumeevidence dependency requires session compatibility metadata")
			}
			if t.catalog != nil && !reflect.TypeOf(t.catalog).Comparable() {
				return nil, fmt.Errorf("catalog dependency must support identity comparison")
			}
			if t.catalog != options.Catalog {
				return nil, fmt.Errorf("consumeevidence capture dependency differs from trusted registration")
			}
			state, err := t.CaptureState(ownergraph.Reference[*chrondbc.Spell](c))
			if err != nil {
				return nil, err
			}
			data, err := state.Encode()
			if err != nil {
				return nil, err
			}
			return json.Marshal(configuredGraphState{Compatibility: options.Compatibility, Configured: options.Catalog != nil, StateVersion: TrackerStateVersion, State: data})
		},
		Restore: func(t *Tracker, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != 2 {
				return fmt.Errorf("unsupported configured consumeevidence graph version %d", version)
			}
			var value configuredGraphState
			if err := decodeConfiguredGraphState(payload, &value); err != nil {
				return err
			}
			if value.Compatibility != options.Compatibility || value.Configured != (options.Catalog != nil) {
				return fmt.Errorf("incompatible consumeevidence graph dependency identity")
			}
			state, err := DecodeTrackerState(value.StateVersion, value.State)
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

// GraphCatalog returns the configured dependency for trusted graph registration.
func (t *Tracker) GraphCatalog() ConsumableCatalog { return t.catalog }

func (c *Collector) GraphAuras() *auras.Tracking { return c.auraTracker }
func (c *Collector) GraphShared() *Tracker       { return c.shared }

func (c *Collector) WireGraphRuntime(emit func(*messages.Consume)) { c.SetEmit(emit) }

// configuredGraphState keeps trusted construction identity outside the leaf codec.
type configuredGraphState struct {
	Compatibility snapshot.Compatibility `json:"compatibility"`
	Configured    bool                   `json:"configured"`
	StateVersion  uint32                 `json:"state_version"`
	State         json.RawMessage        `json:"state"`
}

func decodeConfiguredGraphState(b []byte, value *configuredGraphState) error {
	if err := validateStateJSON(b, "configured consume tracker graph", []string{"compatibility", "configured", "state_version", "state"}); err != nil {
		return err
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	return d.Decode(value)
}
