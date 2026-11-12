package rankings

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"io"
	"slices"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

const EngagementTrackerStateType = "rankings.EngagementTracker"
const EngagementTrackerStateVersion uint32 = 1

// EngagementTrackerState owns active classifications/engagement and retained
// encounter results. Unit metadata remains the injected shared dependency.
type EngagementTrackerState struct{ value engagementTrackerStateValue }

type engagementTrackerStateValue struct {
	Categories []engagementUnitValue   `json:"categories"`
	Engaged    []guid.GUID             `json:"engaged"`
	Results    []engagementResultValue `json:"results"`
}

type engagementUnitValue struct {
	GUID     guid.GUID    `json:"guid"`
	Category UnitCategory `json:"category"`
}

type engagementResultValue struct {
	EncounterID uuid.UUID             `json:"encounter_id"`
	Engaged     []engagementUnitValue `json:"engaged"`
}

func (t *EngagementTracker) CaptureState() (EngagementTrackerState, error) {
	if t == nil || t.units == nil || t.results == nil {
		return EngagementTrackerState{}, fmt.Errorf("incomplete engagement tracker")
	}
	value := engagementTrackerStateValue{Results: make([]engagementResultValue, 0, len(t.results))}
	if t.categories != nil {
		value.Categories = make([]engagementUnitValue, 0, len(t.categories))
		for id, category := range t.categories {
			value.Categories = append(value.Categories, engagementUnitValue{GUID: id, Category: category})
		}
		sortEngagementUnits(value.Categories)
	}
	if t.engaged != nil {
		value.Engaged = make([]guid.GUID, 0, len(t.engaged))
		for id := range t.engaged {
			value.Engaged = append(value.Engaged, id)
		}
		slices.Sort(value.Engaged)
	}
	for encounterID, result := range t.results {
		if result == nil || result.Engaged == nil {
			return EngagementTrackerState{}, fmt.Errorf("incomplete engagement result %s", encounterID)
		}
		entry := engagementResultValue{EncounterID: encounterID, Engaged: make([]engagementUnitValue, 0, len(result.Engaged))}
		for id, category := range result.Engaged {
			entry.Engaged = append(entry.Engaged, engagementUnitValue{GUID: id, Category: category})
		}
		sortEngagementUnits(entry.Engaged)
		value.Results = append(value.Results, entry)
	}
	slices.SortFunc(value.Results, func(a, b engagementResultValue) int {
		return cmp.Compare(a.EncounterID.String(), b.EncounterID.String())
	})
	state := EngagementTrackerState{value: value}
	if err := state.validate(); err != nil {
		return EngagementTrackerState{}, err
	}
	return state, nil
}

func sortEngagementUnits(values []engagementUnitValue) {
	slices.SortFunc(values, func(a, b engagementUnitValue) int { return cmp.Compare(a.GUID, b.GUID) })
}

func (s EngagementTrackerState) Encode() ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	return json.Marshal(s.value)
}

func DecodeEngagementTrackerState(version uint32, payload []byte) (EngagementTrackerState, error) {
	if version != EngagementTrackerStateVersion {
		return EngagementTrackerState{}, fmt.Errorf("unsupported %s version %d", EngagementTrackerStateType, version)
	}
	if err := validateUniqueJSON(payload); err != nil {
		return EngagementTrackerState{}, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil || fields == nil {
		return EngagementTrackerState{}, fmt.Errorf("engagement tracker state must be an object")
	}
	if len(fields) != 3 || len(fields["categories"]) == 0 || len(fields["engaged"]) == 0 || len(fields["results"]) == 0 {
		return EngagementTrackerState{}, fmt.Errorf("engagement tracker state requires categories, engaged, and results")
	}
	if bytes.Equal(bytes.TrimSpace(fields["results"]), []byte("null")) {
		return EngagementTrackerState{}, fmt.Errorf("engagement tracker results cannot be null")
	}
	if err := validateEngagementJSONShape(fields); err != nil {
		return EngagementTrackerState{}, err
	}
	var value engagementTrackerStateValue
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return EngagementTrackerState{}, fmt.Errorf("decode engagement tracker state: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return EngagementTrackerState{}, fmt.Errorf("trailing engagement tracker state")
	}
	state := EngagementTrackerState{value: value}
	if err := state.validate(); err != nil {
		return EngagementTrackerState{}, err
	}
	return state, nil
}

func validateEngagementJSONShape(fields map[string]json.RawMessage) error {
	if !bytes.Equal(bytes.TrimSpace(fields["categories"]), []byte("null")) {
		var categories []json.RawMessage
		if err := json.Unmarshal(fields["categories"], &categories); err != nil {
			return fmt.Errorf("decode engagement categories: %w", err)
		}
		for i, category := range categories {
			if _, err := requiredJSONFields(category, "engagement category", "guid", "category"); err != nil {
				return fmt.Errorf("engagement category %d: %w", i, err)
			}
		}
	}
	if !bytes.Equal(bytes.TrimSpace(fields["engaged"]), []byte("null")) {
		var engaged []json.RawMessage
		if err := json.Unmarshal(fields["engaged"], &engaged); err != nil {
			return fmt.Errorf("decode engaged units: %w", err)
		}
		for i, unit := range engaged {
			if bytes.Equal(bytes.TrimSpace(unit), []byte("null")) {
				return fmt.Errorf("engaged unit %d is null", i)
			}
		}
	}
	var results []json.RawMessage
	if err := json.Unmarshal(fields["results"], &results); err != nil {
		return fmt.Errorf("decode engagement results: %w", err)
	}
	for i, result := range results {
		entry, err := requiredJSONFields(result, "engagement result", "encounter_id", "engaged")
		if err != nil {
			return fmt.Errorf("engagement result %d: %w", i, err)
		}
		var engaged []json.RawMessage
		if err := json.Unmarshal(entry["engaged"], &engaged); err != nil {
			return fmt.Errorf("engagement result %d units: %w", i, err)
		}
		for j, unit := range engaged {
			if _, err := requiredJSONFields(unit, "engagement result unit", "guid", "category"); err != nil {
				return fmt.Errorf("engagement result %d unit %d: %w", i, j, err)
			}
		}
	}
	return nil
}

func (s EngagementTrackerState) validate() error {
	if (s.value.Categories == nil) != (s.value.Engaged == nil) {
		return fmt.Errorf("engagement active maps have inconsistent initialization")
	}
	if s.value.Results == nil {
		return fmt.Errorf("engagement results are nil")
	}
	categories, err := validateEngagementUnits("active categories", s.value.Categories)
	if err != nil {
		return err
	}
	engaged := make(map[guid.GUID]struct{}, len(s.value.Engaged))
	for _, id := range s.value.Engaged {
		if _, exists := engaged[id]; exists {
			return fmt.Errorf("duplicate engaged unit %s", id)
		}
		if _, exists := categories[id]; !exists {
			return fmt.Errorf("engaged unit %s is not classified", id)
		}
		engaged[id] = struct{}{}
	}
	seenResults := make(map[uuid.UUID]struct{}, len(s.value.Results))
	for _, result := range s.value.Results {
		if result.EncounterID == uuid.Nil || result.Engaged == nil {
			return fmt.Errorf("invalid engagement result %s", result.EncounterID)
		}
		if _, exists := seenResults[result.EncounterID]; exists {
			return fmt.Errorf("duplicate engagement result %s", result.EncounterID)
		}
		seenResults[result.EncounterID] = struct{}{}
		if _, err := validateEngagementUnits("result units", result.Engaged); err != nil {
			return fmt.Errorf("engagement result %s: %w", result.EncounterID, err)
		}
	}
	return nil
}

func validateEngagementUnits(label string, values []engagementUnitValue) (map[guid.GUID]UnitCategory, error) {
	units := make(map[guid.GUID]UnitCategory, len(values))
	for _, value := range values {
		if value.Category < CategoryUnknown || value.Category > CategoryPet {
			return nil, fmt.Errorf("invalid %s category %d", label, value.Category)
		}
		if _, exists := units[value.GUID]; exists {
			return nil, fmt.Errorf("duplicate %s unit %s", label, value.GUID)
		}
		units[value.GUID] = value.Category
	}
	return units, nil
}

// Restore creates a fresh tracker and reuses the canonical unit database.
// It does not classify units, propagate engagement, or invoke hooks.
func (s EngagementTrackerState) Restore(units *unitdb.Units) (*EngagementTracker, error) {
	if units == nil {
		return nil, fmt.Errorf("nil engagement unit dependency")
	}
	if err := s.validate(); err != nil {
		return nil, err
	}
	tracker := NewEngagementTracker(units)
	if s.value.Categories != nil {
		tracker.categories = make(map[guid.GUID]UnitCategory, len(s.value.Categories))
		for _, value := range s.value.Categories {
			tracker.categories[value.GUID] = value.Category
		}
		tracker.engaged = make(map[guid.GUID]struct{}, len(s.value.Engaged))
		for _, id := range s.value.Engaged {
			tracker.engaged[id] = struct{}{}
		}
	}
	for _, result := range s.value.Results {
		engaged := make(map[guid.GUID]UnitCategory, len(result.Engaged))
		for _, value := range result.Engaged {
			engaged[value.GUID] = value.Category
		}
		tracker.results[result.EncounterID] = &EngagementResult{Engaged: engaged}
	}
	return tracker, nil
}
