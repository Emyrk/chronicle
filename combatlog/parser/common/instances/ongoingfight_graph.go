package instances

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/google/uuid"
)

const ongoingFightGraphType = "instances.ongoing-fight"
const ongoingFightGraphVersion uint32 = 1

type ongoingFightGraphState struct {
	Difficulty             zone.Difficulty        `json:"difficulty"`
	ZoneDifficulty         *zone.Difficulty       `json:"zone_difficulty"`
	EncounterID            uuid.UUID              `json:"encounter_id"`
	MapID                  uint32                 `json:"map_id"`
	ActiveHostiles         map[guid.GUID]struct{} `json:"active_hostiles"`
	Events                 string                 `json:"events"`
	PlayerDeaths           []string               `json:"player_deaths"`
	Phases                 string                 `json:"phases"`
	StagedPhaseTransitions []phases.Transition    `json:"staged_phase_transitions"`
	AuthoritativeStart     string                 `json:"authoritative_start"`
	AuthoritativeName      string                 `json:"authoritative_name"`
	AuthoritativeSuccess   *bool                  `json:"authoritative_success"`
	Start                  string                 `json:"start"`
	End                    string                 `json:"end"`
}

// RegisterOngoingFightGraphOwner registers only the in-flight aggregate. Callers
// register phase, event, moment and retained-message owners separately. Capture
// requires a quiescent graph; restore does not process events or finalize fights.
func RegisterOngoingFightGraphOwner(r *ownergraph.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[ongoingFight]{
		Type: ongoingFightGraphType, Version: ongoingFightGraphVersion,
		Init: func() *ongoingFight { return new(ongoingFight) },
		Capture: func(f *ongoingFight, c *ownergraph.Capture) ([]byte, error) {
			if f.Events == nil {
				return nil, fmt.Errorf("missing ongoing fight events")
			}
			v := ongoingFightGraphState{Difficulty: f.Difficulty, ZoneDifficulty: f.ZoneDifficulty, EncounterID: f.EncounterID, MapID: f.MapID, ActiveHostiles: f.ActiveHostiles, StagedPhaseTransitions: f.StagedPhaseTransitions, AuthoritativeName: f.AuthoritativeName, AuthoritativeSuccess: f.AuthoritativeSuccess}
			var err error
			v.Events, err = c.Ref(f.Events)
			if err != nil {
				return nil, err
			}
			if f.Phases != nil {
				v.Phases, err = c.Ref(f.Phases)
				if err != nil {
					return nil, err
				}
			}
			if f.AuthoritativeStart != nil {
				v.AuthoritativeStart, err = c.Ref(f.AuthoritativeStart)
				if err != nil {
					return nil, err
				}
			}
			if f.Start != nil {
				v.Start, err = c.Ref(f.Start)
				if err != nil {
					return nil, err
				}
			}
			if f.End != nil {
				v.End, err = c.Ref(f.End)
				if err != nil {
					return nil, err
				}
			}
			if f.PlayerDeaths != nil {
				v.PlayerDeaths = make([]string, len(f.PlayerDeaths))
			}
			for i, death := range f.PlayerDeaths {
				if death == nil {
					return nil, fmt.Errorf("nil retained player death")
				}
				v.PlayerDeaths[i], err = c.Ref(death)
				if err != nil {
					return nil, err
				}
			}
			return json.Marshal(v)
		},
		Restore: func(f *ongoingFight, version uint32, data []byte, c *ownergraph.Restore) error {
			if version != ongoingFightGraphVersion {
				return fmt.Errorf("unsupported ongoing fight version %d", version)
			}
			var v ongoingFightGraphState
			if err := decodeLeafValue(data, &v); err != nil {
				return err
			}
			if v.Events == "" {
				return fmt.Errorf("missing ongoing fight events")
			}
			next := ongoingFight{Difficulty: v.Difficulty, ZoneDifficulty: v.ZoneDifficulty, EncounterID: v.EncounterID, MapID: v.MapID, ActiveHostiles: v.ActiveHostiles, StagedPhaseTransitions: v.StagedPhaseTransitions, AuthoritativeName: v.AuthoritativeName, AuthoritativeSuccess: v.AuthoritativeSuccess}
			var err error
			next.Events, err = ownergraph.LoadAs[*encounterevents.EncounterEventsInProgress](c, v.Events)
			if err != nil {
				return err
			}
			if v.Phases != "" {
				next.Phases, err = ownergraph.LoadAs[*phaseTracker](c, v.Phases)
				if err != nil {
					return err
				}
			}
			if v.AuthoritativeStart != "" {
				next.AuthoritativeStart, err = ownergraph.LoadAs[*messages.EncounterBoundary](c, v.AuthoritativeStart)
				if err != nil {
					return err
				}
			}
			if v.Start != "" {
				next.Start, err = ownergraph.LoadAs[*period.Moment](c, v.Start)
				if err != nil {
					return err
				}
			}
			if v.End != "" {
				next.End, err = ownergraph.LoadAs[*period.Moment](c, v.End)
				if err != nil {
					return err
				}
			}
			if v.PlayerDeaths != nil {
				next.PlayerDeaths = make([]messages.Message, len(v.PlayerDeaths))
			}
			for i, ref := range v.PlayerDeaths {
				if ref == "" {
					return fmt.Errorf("missing retained player death")
				}
				next.PlayerDeaths[i], err = ownergraph.LoadAs[messages.Message](c, ref)
				if err != nil {
					return err
				}
			}
			*f = next
			return nil
		},
	})
}
