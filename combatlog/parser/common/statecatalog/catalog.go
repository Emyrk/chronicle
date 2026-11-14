// Package statecatalog describes the parser state graph we intend to make
// snapshot-capable. It is deliberately declarative and does not walk runtime
// pointers.
package statecatalog

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/internal/stategraph"
)

const (
	TypeEncounterState = "github.com/Emyrk/chronicle/combatlog/parser/common/encounters.State"
	TypeHookable       = "github.com/Emyrk/chronicle/combatlog/parser/common/instances.Hookable"
	TypeUnits          = "github.com/Emyrk/chronicle/combatlog/parser/common/unitdb.Units"
	TypeVehicles       = "github.com/Emyrk/chronicle/combatlog/parser/common/vehicles.Tracker"
	TypeRaidGroups     = "github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups.Tracker"
	TypeAuras          = "github.com/Emyrk/chronicle/combatlog/parser/common/auras.Tracking"
	TypeConsumes       = "github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence.Tracker"
)

// Target returns the first target-state catalog. It covers the parse-wide
// trackers owned by encounters.State and the references attached to one
// representative instances.Hookable by State.createInstance.
func Target() (stategraph.Graph, error) {
	registry, err := stategraph.New("/root")
	if err != nil {
		return stategraph.Graph{}, err
	}

	steps := []func() error{
		func() error {
			return registry.Directory("/root", metadata("parser snapshot root", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Directory("/root/shared", metadata("parse-wide shared state", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/shared/units", TypeUnits, metadata("State.Units", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/shared/vehicles", TypeVehicles, metadata("State.Vehicles", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/shared/raid-groups", TypeRaidGroups, metadata("State.RaidGroups", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/shared/auras", TypeAuras, metadata("State.Auras", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/shared/consume-tracker", TypeConsumes, metadata("State.ConsumeTracker", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/encounters", TypeEncounterState, metadata("encounters.State", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Reference("/root/encounters/units", "/root/shared/units", TypeUnits, nil)
		},
		func() error {
			return registry.Reference("/root/encounters/vehicles", "/root/shared/vehicles", TypeVehicles, nil)
		},
		func() error {
			return registry.Reference("/root/encounters/raid-groups", "/root/shared/raid-groups", TypeRaidGroups, nil)
		},
		func() error {
			return registry.Reference("/root/encounters/auras", "/root/shared/auras", TypeAuras, nil)
		},
		func() error {
			return registry.Reference("/root/encounters/consume-tracker", "/root/shared/consume-tracker", TypeConsumes, nil)
		},
		func() error {
			return registry.Directory("/root/encounters/instances", metadata("State.Instances aliases", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Reference("/root/encounters/current-instance", "/root/instances/0000", TypeHookable, metadata("State.CurrentInstance", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Reference("/root/encounters/instances/0000", "/root/instances/0000", TypeHookable, metadata("State.Instances[0]", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Directory("/root/instances", metadata("instances discovered in parse order", "combatlog/parser/common/encounters/consumer.go"))
		},
		func() error {
			return registry.Value("/root/instances/0000", TypeHookable, metadata("representative instance", "combatlog/parser/common/instances/hookable.go"))
		},
		func() error {
			return registry.Reference("/root/instances/0000/units", "/root/shared/units", TypeUnits, nil)
		},
		func() error {
			return registry.Reference("/root/instances/0000/vehicles", "/root/shared/vehicles", TypeVehicles, nil)
		},
		func() error {
			return registry.Reference("/root/instances/0000/raid-groups", "/root/shared/raid-groups", TypeRaidGroups, nil)
		},
		func() error {
			return registry.Reference("/root/instances/0000/auras", "/root/shared/auras", TypeAuras, nil)
		},
		func() error {
			return registry.Reference("/root/instances/0000/consume-tracker", "/root/shared/consume-tracker", TypeConsumes, nil)
		},
	}
	for _, step := range steps {
		if err := step(); err != nil {
			return stategraph.Graph{}, err
		}
	}

	for _, target := range []string{
		"/root/shared/units",
		"/root/shared/vehicles",
		"/root/shared/raid-groups",
		"/root/shared/auras",
		"/root/shared/consume-tracker",
	} {
		if err := registry.DependsOn("/root/encounters", target); err != nil {
			return stategraph.Graph{}, err
		}
		if err := registry.DependsOn("/root/instances/0000", target); err != nil {
			return stategraph.Graph{}, err
		}
	}
	return registry.Graph()
}

func metadata(label, source string) json.RawMessage {
	data, err := json.Marshal(struct {
		Label  string `json:"label"`
		Source string `json:"source"`
	}{Label: label, Source: source})
	if err != nil {
		panic(fmt.Sprintf("marshal static state catalog metadata: %v", err))
	}
	return data
}
