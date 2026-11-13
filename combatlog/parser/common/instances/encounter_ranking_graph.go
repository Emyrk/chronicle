package instances

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// EncounterRankingGraph is a bounded checkpoint component, not a Hookable or
// session. It connects event buffers and DPS tracking through one canonical
// owner graph. It has no hooks, source lifecycle, finalizer or publication API.
// Callers must quiesce these owners together before capturing them.
type EncounterRankingGraph struct {
	InProgress *encounterevents.EncounterEventsInProgress
	Finalized  *encounterevents.Events
	DPS        *rankings.DPSTracker
}

const encounterRankingGraphType = "instances.encounter-ranking-graph"
const encounterRankingGraphVersion uint32 = 1

type encounterRankingGraphState struct {
	InProgress string `json:"in_progress"`
	Finalized  string `json:"finalized"`
	DPS        string `json:"dps"`
}

// RegisterEncounterRankingGraph registers only this component root. Callers
// explicitly register event, DPS, Damage, Units and trusted Identifier owners
// (and any referenced spell owners). Missing registrations fail closed.
func RegisterEncounterRankingGraph(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[EncounterRankingGraph]{
		Type: encounterRankingGraphType, Version: encounterRankingGraphVersion,
		Init: func() *EncounterRankingGraph { return new(EncounterRankingGraph) },
		Capture: func(root *EncounterRankingGraph, c *ownergraph.Capture) ([]byte, error) {
			events, err := c.Ref(root.InProgress)
			if err != nil {
				return nil, err
			}
			dps, err := c.Ref(root.DPS)
			if err != nil {
				return nil, err
			}
			var finalized string
			if root.Finalized != nil {
				finalized, err = c.Ref(root.Finalized)
				if err != nil {
					return nil, err
				}
			}
			return json.Marshal(encounterRankingGraphState{InProgress: events, Finalized: finalized, DPS: dps})
		},
		Restore: func(root *EncounterRankingGraph, version uint32, payload []byte, c *ownergraph.Restore) error {
			if version != encounterRankingGraphVersion {
				return fmt.Errorf("unsupported encounter ranking graph version %d", version)
			}
			var value encounterRankingGraphState
			if err := decodeLeafValue(payload, &value); err != nil {
				return err
			}
			events, err := ownergraph.Loader[*encounterevents.EncounterEventsInProgress](c)(value.InProgress)
			if err != nil {
				return err
			}
			dps, err := ownergraph.Loader[*rankings.DPSTracker](c)(value.DPS)
			if err != nil {
				return err
			}
			var finalized *encounterevents.Events
			if value.Finalized != "" {
				finalized, err = ownergraph.Loader[*encounterevents.Events](c)(value.Finalized)
				if err != nil {
					return err
				}
			}
			*root = EncounterRankingGraph{InProgress: events, Finalized: finalized, DPS: dps}
			return nil
		},
	})
}
