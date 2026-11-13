package instances

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// EncounterComponentGraph is a bounded component root, not a Hookable or parse
// session. It joins the existing encounter-event/DPS graph to shared trackers
// whose state already has owner-local codecs. It owns no source, finalizer,
// service, publication, or database behavior.
type EncounterComponentGraph struct {
	Ranking          *EncounterRankingGraph
	Units            *unitdb.Units
	Auras            *auras.Tracking
	AuraProjection   *auras.Projection
	Vehicles         *vehicles.Tracker
	RaidGroups       *raidgroups.Tracker
	Participants     *participants.Tracker
	Armory           *armory.Tracker
	ConsumeTracker   *consumeevidence.Tracker
	ConsumeCollector *consumeevidence.Collector

	runtimeWired bool
}

const encounterComponentGraphType = "instances.encounter-component-graph"
const encounterComponentGraphVersion uint32 = 1

type encounterComponentGraphState struct {
	Ranking          string `json:"ranking"`
	Units            string `json:"units"`
	Auras            string `json:"auras"`
	AuraProjection   string `json:"aura_projection"`
	Vehicles         string `json:"vehicles"`
	RaidGroups       string `json:"raid_groups"`
	Participants     string `json:"participants"`
	Armory           string `json:"armory"`
	ConsumeTracker   string `json:"consume_tracker"`
	ConsumeCollector string `json:"consume_collector"`
}

func RegisterEncounterComponentGraph(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[EncounterComponentGraph]{
		Type: encounterComponentGraphType, Version: encounterComponentGraphVersion,
		Init: func() *EncounterComponentGraph { return new(EncounterComponentGraph) },
		Capture: func(root *EncounterComponentGraph, c *ownergraph.Capture) ([]byte, error) {
			if err := validateEncounterComponentGraph(root); err != nil {
				return nil, err
			}
			owners := []any{root.Ranking, root.Units, root.Auras, root.AuraProjection, root.Vehicles, root.RaidGroups, root.Participants, root.Armory, root.ConsumeTracker, root.ConsumeCollector}
			refs := make([]string, len(owners))
			for i, owner := range owners {
				value, err := c.Ref(owner)
				if err != nil {
					return nil, err
				}
				refs[i] = value
			}
			return json.Marshal(encounterComponentGraphState{
				Ranking: refs[0], Units: refs[1], Auras: refs[2], AuraProjection: refs[3], Vehicles: refs[4],
				RaidGroups: refs[5], Participants: refs[6], Armory: refs[7], ConsumeTracker: refs[8], ConsumeCollector: refs[9],
			})
		},
		Restore: func(root *EncounterComponentGraph, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != encounterComponentGraphVersion {
				return fmt.Errorf("unsupported encounter component graph version %d", version)
			}
			var value encounterComponentGraphState
			if err := decodeLeafValue(payload, &value); err != nil {
				return err
			}
			if value.Ranking == "" || value.Units == "" || value.Auras == "" || value.AuraProjection == "" || value.Vehicles == "" || value.RaidGroups == "" || value.Participants == "" || value.Armory == "" || value.ConsumeTracker == "" || value.ConsumeCollector == "" {
				return fmt.Errorf("incomplete encounter component graph dependencies")
			}
			var err error
			root.Ranking, err = ownergraph.LoadAs[*EncounterRankingGraph](c, value.Ranking)
			if err != nil {
				return err
			}
			root.Units, err = ownergraph.LoadAs[*unitdb.Units](c, value.Units)
			if err != nil {
				return err
			}
			root.Auras, err = ownergraph.LoadAs[*auras.Tracking](c, value.Auras)
			if err != nil {
				return err
			}
			root.AuraProjection, err = ownergraph.LoadAs[*auras.Projection](c, value.AuraProjection)
			if err != nil {
				return err
			}
			root.Vehicles, err = ownergraph.LoadAs[*vehicles.Tracker](c, value.Vehicles)
			if err != nil {
				return err
			}
			root.RaidGroups, err = ownergraph.LoadAs[*raidgroups.Tracker](c, value.RaidGroups)
			if err != nil {
				return err
			}
			root.Participants, err = ownergraph.LoadAs[*participants.Tracker](c, value.Participants)
			if err != nil {
				return err
			}
			root.Armory, err = ownergraph.LoadAs[*armory.Tracker](c, value.Armory)
			if err != nil {
				return err
			}
			root.ConsumeTracker, err = ownergraph.LoadAs[*consumeevidence.Tracker](c, value.ConsumeTracker)
			if err != nil {
				return err
			}
			root.ConsumeCollector, err = ownergraph.LoadAs[*consumeevidence.Collector](c, value.ConsumeCollector)
			return err
		},
		Validate: validateEncounterComponentGraph,
	})
}

func validateEncounterComponentGraph(root *EncounterComponentGraph) error {
	if root.Ranking == nil || root.Ranking.DPS == nil || root.Units == nil || root.Auras == nil || root.AuraProjection == nil || root.Vehicles == nil || root.RaidGroups == nil || root.Participants == nil || root.Armory == nil || root.ConsumeTracker == nil || root.ConsumeCollector == nil {
		return fmt.Errorf("incomplete encounter component graph")
	}
	if root.Ranking.DPS.GraphUnits() != root.Units || root.Armory.GraphUnits() != root.Units {
		return fmt.Errorf("encounter component graph requires one canonical Units owner")
	}
	if root.AuraProjection.GraphTracking() != root.Auras || root.ConsumeCollector.GraphAuras() != root.Auras || root.ConsumeCollector.GraphShared() != root.ConsumeTracker {
		return fmt.Errorf("encounter component graph requires canonical shared trackers")
	}
	return nil
}

type EncounterComponentRuntime struct {
	EmitAura    func(*messages.Aura)
	EmitConsume func(*messages.Consume)
}

// WireGraphRuntime attaches trusted callbacks after allocate/load/validate has
// completed for every owner. Restore itself never invokes this method.
func (root *EncounterComponentGraph) WireGraphRuntime(runtime EncounterComponentRuntime) error {
	if err := validateEncounterComponentGraph(root); err != nil {
		return err
	}
	if runtime.EmitAura == nil || runtime.EmitConsume == nil {
		return fmt.Errorf("encounter component graph runtime callbacks are required")
	}
	if root.runtimeWired {
		return fmt.Errorf("encounter component graph runtime is already wired")
	}
	// Observer order is semantic: armory invalidation precedes projection cleanup.
	root.Auras.AddObserver(root.Armory.ObserveAura)
	root.AuraProjection.WireGraphRuntime(runtime.EmitAura)
	root.ConsumeCollector.WireGraphRuntime(runtime.EmitConsume)
	root.runtimeWired = true
	return nil
}
