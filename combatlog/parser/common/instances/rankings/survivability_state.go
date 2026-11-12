package rankings

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const SurvivabilityTrackerStateType = "rankings.SurvivabilityTracker"
const SurvivabilityTrackerStateVersion uint32 = 1

// SurvivabilityTrackerState owns active life transitions and retained encounter
// results. Hook registration remains session composition.
type SurvivabilityTrackerState struct {
	value survivabilityTrackerStateValue
}

type survivabilityTrackerStateValue struct {
	Players []survivabilityPlayerStateValue `json:"players"`
	Results []survivabilityResultStateValue `json:"results"`
}

type survivabilityPlayerStateValue struct {
	GUID        guid.GUID                      `json:"guid"`
	Dead        bool                           `json:"dead"`
	Transitions []survivabilityTransitionValue `json:"transitions"`
}

type survivabilityTransitionValue struct {
	At   time.Time `json:"at"`
	Dead bool      `json:"dead"`
}

type survivabilityResultStateValue struct {
	EncounterID uuid.UUID                        `json:"encounter_id"`
	Duration    float64                          `json:"duration_secs"`
	Players     []survivabilityResultPlayerValue `json:"players"`
}

type survivabilityResultPlayerValue struct {
	GUID              guid.GUID `json:"guid"`
	Deaths            int32     `json:"deaths"`
	AliveDurationSecs float64   `json:"alive_duration_secs"`
	AlivePercentage   float64   `json:"alive_percentage"`
}

func (t *SurvivabilityTracker) CaptureState() (SurvivabilityTrackerState, error) {
	if t == nil || t.players == nil || t.results == nil {
		return SurvivabilityTrackerState{}, fmt.Errorf("incomplete survivability tracker")
	}
	value := survivabilityTrackerStateValue{
		Players: make([]survivabilityPlayerStateValue, 0, len(t.players)),
		Results: make([]survivabilityResultStateValue, 0, len(t.results)),
	}
	for id, state := range t.players {
		if state == nil {
			return SurvivabilityTrackerState{}, fmt.Errorf("nil life state for %s", id)
		}
		player := survivabilityPlayerStateValue{GUID: id, Dead: state.dead, Transitions: make([]survivabilityTransitionValue, len(state.transitions))}
		for i, transition := range state.transitions {
			player.Transitions[i] = survivabilityTransitionValue{At: transition.at, Dead: transition.dead}
		}
		value.Players = append(value.Players, player)
	}
	slices.SortFunc(value.Players, func(a, b survivabilityPlayerStateValue) int { return cmp.Compare(a.GUID, b.GUID) })
	for encounterID, result := range t.results {
		if result == nil || result.Players == nil {
			return SurvivabilityTrackerState{}, fmt.Errorf("incomplete survivability result %s", encounterID)
		}
		entry := survivabilityResultStateValue{
			EncounterID: encounterID,
			Duration:    result.DurationSecs,
			Players:     make([]survivabilityResultPlayerValue, 0, len(result.Players)),
		}
		for id, player := range result.Players {
			entry.Players = append(entry.Players, survivabilityResultPlayerValue{
				GUID: id, Deaths: player.Deaths, AliveDurationSecs: player.AliveDurationSecs, AlivePercentage: player.AlivePercentage,
			})
		}
		slices.SortFunc(entry.Players, func(a, b survivabilityResultPlayerValue) int { return cmp.Compare(a.GUID, b.GUID) })
		value.Results = append(value.Results, entry)
	}
	slices.SortFunc(value.Results, func(a, b survivabilityResultStateValue) int {
		return cmp.Compare(a.EncounterID.String(), b.EncounterID.String())
	})
	state := SurvivabilityTrackerState{value: value}
	if err := state.validate(); err != nil {
		return SurvivabilityTrackerState{}, err
	}
	return state, nil
}

func (s SurvivabilityTrackerState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeSurvivabilityTrackerState(version uint32, payload []byte) (SurvivabilityTrackerState, error) {
	if version != SurvivabilityTrackerStateVersion {
		return SurvivabilityTrackerState{}, fmt.Errorf("unsupported %s version %d", SurvivabilityTrackerStateType, version)
	}
	if err := validateUniqueJSON(payload); err != nil {
		return SurvivabilityTrackerState{}, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return SurvivabilityTrackerState{}, fmt.Errorf("survivability tracker state must be an object")
	}
	if len(fields) != 2 || len(fields["players"]) == 0 || len(fields["results"]) == 0 {
		return SurvivabilityTrackerState{}, fmt.Errorf("survivability tracker state requires players and results")
	}
	if bytes.Equal(bytes.TrimSpace(fields["players"]), []byte("null")) || bytes.Equal(bytes.TrimSpace(fields["results"]), []byte("null")) {
		return SurvivabilityTrackerState{}, fmt.Errorf("survivability tracker collections cannot be null")
	}
	if err := validateSurvivabilityJSONShape(fields); err != nil {
		return SurvivabilityTrackerState{}, err
	}
	var value survivabilityTrackerStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return SurvivabilityTrackerState{}, fmt.Errorf("decode survivability tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return SurvivabilityTrackerState{}, fmt.Errorf("trailing survivability tracker state")
	}
	state := SurvivabilityTrackerState{value: value}
	if err := state.validate(); err != nil {
		return SurvivabilityTrackerState{}, err
	}
	return state, nil
}

func validateSurvivabilityJSONShape(fields map[string]json.RawMessage) error {
	var players []json.RawMessage
	if err := json.Unmarshal(fields["players"], &players); err != nil {
		return fmt.Errorf("decode survivability players: %w", err)
	}
	for i, raw := range players {
		entry, err := requiredJSONFields(raw, "survivability player", "guid", "dead", "transitions")
		if err != nil {
			return fmt.Errorf("survivability player %d: %w", i, err)
		}
		var transitions []json.RawMessage
		if err := json.Unmarshal(entry["transitions"], &transitions); err != nil {
			return fmt.Errorf("survivability player %d transitions: %w", i, err)
		}
		for j, transition := range transitions {
			if _, err := requiredJSONFields(transition, "survivability transition", "at", "dead"); err != nil {
				return fmt.Errorf("survivability player %d transition %d: %w", i, j, err)
			}
		}
	}
	var results []json.RawMessage
	if err := json.Unmarshal(fields["results"], &results); err != nil {
		return fmt.Errorf("decode survivability results: %w", err)
	}
	for i, raw := range results {
		entry, err := requiredJSONFields(raw, "survivability result", "encounter_id", "duration_secs", "players")
		if err != nil {
			return fmt.Errorf("survivability result %d: %w", i, err)
		}
		var resultPlayers []json.RawMessage
		if err := json.Unmarshal(entry["players"], &resultPlayers); err != nil {
			return fmt.Errorf("survivability result %d players: %w", i, err)
		}
		for j, player := range resultPlayers {
			if _, err := requiredJSONFields(player, "survivability result player", "guid", "deaths", "alive_duration_secs", "alive_percentage"); err != nil {
				return fmt.Errorf("survivability result %d player %d: %w", i, j, err)
			}
		}
	}
	return nil
}

func requiredJSONFields(payload []byte, label string, names ...string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return nil, fmt.Errorf("%s must be an object", label)
	}
	if len(fields) != len(names) {
		return nil, fmt.Errorf("%s requires %d fields", label, len(names))
	}
	for _, name := range names {
		raw, exists := fields[name]
		if !exists || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil, fmt.Errorf("%s field %q is missing or null", label, name)
		}
	}
	return fields, nil
}

func (s SurvivabilityTrackerState) validate() error {
	if s.value.Players == nil || s.value.Results == nil {
		return fmt.Errorf("survivability tracker collections are nil")
	}
	seenPlayers := make(map[guid.GUID]struct{}, len(s.value.Players))
	for _, player := range s.value.Players {
		if player.GUID.IsZero() || !player.GUID.IsPlayer() {
			return fmt.Errorf("invalid survivability player %s", player.GUID)
		}
		if _, exists := seenPlayers[player.GUID]; exists {
			return fmt.Errorf("duplicate survivability player %s", player.GUID)
		}
		seenPlayers[player.GUID] = struct{}{}
		if player.Transitions == nil {
			return fmt.Errorf("nil transitions for survivability player %s", player.GUID)
		}
		dead := false
		var previous time.Time
		for i, transition := range player.Transitions {
			if transition.At.IsZero() {
				return fmt.Errorf("zero transition time for survivability player %s", player.GUID)
			}
			if i > 0 && transition.At.Before(previous) {
				return fmt.Errorf("out-of-order transitions for survivability player %s", player.GUID)
			}
			if transition.Dead == dead {
				return fmt.Errorf("non-alternating transitions for survivability player %s", player.GUID)
			}
			dead = transition.Dead
			previous = transition.At
		}
		if dead != player.Dead {
			return fmt.Errorf("life state mismatch for survivability player %s", player.GUID)
		}
	}
	seenResults := make(map[uuid.UUID]struct{}, len(s.value.Results))
	for _, result := range s.value.Results {
		if result.EncounterID == uuid.Nil {
			return fmt.Errorf("nil survivability encounter ID")
		}
		if _, exists := seenResults[result.EncounterID]; exists {
			return fmt.Errorf("duplicate survivability result %s", result.EncounterID)
		}
		seenResults[result.EncounterID] = struct{}{}
		if invalidSurvivabilityNumber(result.Duration) || result.Duration < 0 || result.Players == nil {
			return fmt.Errorf("invalid survivability result %s", result.EncounterID)
		}
		seenResultPlayers := make(map[guid.GUID]struct{}, len(result.Players))
		for _, player := range result.Players {
			if player.GUID.IsZero() || !player.GUID.IsPlayer() || player.Deaths < 0 || invalidSurvivabilityNumber(player.AliveDurationSecs) || invalidSurvivabilityNumber(player.AlivePercentage) || player.AliveDurationSecs < 0 || player.AliveDurationSecs > result.Duration || player.AlivePercentage < 0 || player.AlivePercentage > 100 {
				return fmt.Errorf("invalid survivability result player %s", player.GUID)
			}
			if _, exists := seenResultPlayers[player.GUID]; exists {
				return fmt.Errorf("duplicate survivability result player %s", player.GUID)
			}
			seenResultPlayers[player.GUID] = struct{}{}
		}
	}
	return nil
}

func invalidSurvivabilityNumber(value float64) bool { return math.IsNaN(value) || math.IsInf(value, 0) }

// Restore creates a fresh tracker without invoking gameplay or finalization.
func (s SurvivabilityTrackerState) Restore() (*SurvivabilityTracker, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	tracker := NewSurvivabilityTracker()
	for _, player := range s.value.Players {
		state := &playerLifeState{dead: player.Dead, transitions: make([]lifeTransition, len(player.Transitions))}
		for i, transition := range player.Transitions {
			state.transitions[i] = lifeTransition{at: transition.At, dead: transition.Dead}
		}
		tracker.players[player.GUID] = state
	}
	for _, result := range s.value.Results {
		players := make(map[guid.GUID]PlayerSurvivability, len(result.Players))
		for _, player := range result.Players {
			players[player.GUID] = PlayerSurvivability{Deaths: player.Deaths, AliveDurationSecs: player.AliveDurationSecs, AlivePercentage: player.AlivePercentage}
		}
		tracker.results[result.EncounterID] = &SurvivabilityResult{DurationSecs: result.Duration, Players: players}
	}
	return tracker, nil
}
