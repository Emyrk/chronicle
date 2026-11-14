package identifier

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"maps"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

const StateType = "identifier.Identifier"
const StateVersion uint32 = 1

// TrustedRecipe is supplied by code, never selected by an archive. ID identifies
// the existing instance/map construction recipe. Parser version and flavor are
// fixed by the enclosing session fingerprint, not duplicated in this owner.
//
// Factory must reconstruct fresh static rules with the same pure callbacks.
// Inputs and HostileEntries remain mutable for compatibility: trusted code must
// not replace callbacks or mutate captured closure state. The scalar fingerprint
// detects visible configuration drift, NOT callback identity or behavior.
type TrustedRecipe struct {
	ID      string
	Factory func() *Identifier
}

// New explicitly binds a trusted construction recipe. Ordinary NewIdentifier
// instances cannot be captured. No constructor is looked up from serialized data.
func (r TrustedRecipe) New() (*Identifier, error) {
	if r.ID == "" || r.Factory == nil {
		return nil, fmt.Errorf("complete trusted identifier recipe required")
	}
	i := r.Factory()
	if i == nil || i.recipeID != "" || i.dynamicallyModified || len(i.unknownUnits) != 0 {
		return nil, fmt.Errorf("recipe must construct a fresh static identifier")
	}
	configuration, err := fingerprint(i.byEntryId)
	if err != nil {
		return nil, err
	}
	// Existing FromMap factories may reuse their static map. Detach the candidate
	// without changing those factories or the existing HostileEntries API.
	return &Identifier{byEntryId: maps.Clone(i.byEntryId), unknownUnits: maps.Clone(i.unknownUnits), recipeID: r.ID, configuration: configuration}, nil
}

type identityValue struct {
	Affiliation                  types.Affiliation `json:"affiliation"`
	Name                         string            `json:"name"`
	EncounterName                string            `json:"encounter_name"`
	Boss                         bool              `json:"boss"`
	BossDeathDoesNotEndEncounter bool              `json:"boss_death_does_not_end_encounter"`
	HasEncounterNameFunc         bool              `json:"has_encounter_name_func"`
}

func fingerprint(entries map[uint32]Identity) (string, error) {
	var values map[uint32]identityValue
	if entries != nil {
		values = make(map[uint32]identityValue, len(entries))
	}
	for id, v := range entries {
		values[id] = identityValue{v.Affiliation, v.Name, v.EncounterName, v.Boss, v.BossDeathDoesNotEndEncounter, v.EncounterNameFn != nil}
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

type State struct{ value stateValue }
type stateValue struct {
	RecipeID      string         `json:"recipe_id"`
	Configuration string         `json:"configuration"`
	UnknownUnits  map[uint32]int `json:"unknown_units"`
}

func (i *Identifier) CaptureState() (State, error) {
	if i == nil || i.recipeID == "" || i.dynamicallyModified || i.serverClassification {
		return State{}, fmt.Errorf("identifier requires unmodified trusted static recipe")
	}
	current, err := fingerprint(i.byEntryId)
	if err != nil {
		return State{}, err
	}
	if current != i.configuration {
		return State{}, fmt.Errorf("identifier static configuration changed")
	}
	return State{stateValue{i.recipeID, current, maps.Clone(i.unknownUnits)}}, nil
}
func (s State) Encode() ([]byte, error) { return json.Marshal(s.value) }
func DecodeState(version uint32, payload []byte) (State, error) {
	if version != StateVersion {
		return State{}, fmt.Errorf("unsupported identifier state version %d", version)
	}
	// A token pass rejects duplicate fields and duplicate entry counts before
	// ordinary typed decoding can silently overwrite either.
	d := json.NewDecoder(bytes.NewReader(payload))
	token, err := d.Token()
	if err != nil {
		return State{}, err
	}
	if token != json.Delim('{') {
		return State{}, fmt.Errorf("identifier state must be an object")
	}
	fields := make(map[string]json.RawMessage)
	for d.More() {
		token, err := d.Token()
		if err != nil {
			return State{}, err
		}
		key := token.(string)
		if _, ok := fields[key]; ok {
			return State{}, fmt.Errorf("duplicate identifier field %q", key)
		}
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return State{}, err
		}
		fields[key] = raw
	}
	if _, err := d.Token(); err != nil {
		return State{}, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return State{}, fmt.Errorf("trailing identifier state")
	}
	if len(fields) != 3 {
		return State{}, fmt.Errorf("identifier state requires exactly three fields")
	}
	for _, key := range []string{"recipe_id", "configuration", "unknown_units"} {
		if len(fields[key]) == 0 {
			return State{}, fmt.Errorf("missing identifier field %q", key)
		}
	}
	var v stateValue
	if err := json.Unmarshal(fields["recipe_id"], &v.RecipeID); err != nil {
		return State{}, err
	}
	if err := json.Unmarshal(fields["configuration"], &v.Configuration); err != nil {
		return State{}, err
	}
	hash, err := hex.DecodeString(v.Configuration)
	if v.RecipeID == "" || err != nil || len(hash) != sha256.Size {
		return State{}, fmt.Errorf("invalid identifier recipe identity")
	}
	raw := bytes.TrimSpace(fields["unknown_units"])
	if !bytes.Equal(raw, []byte("null")) {
		counts := json.NewDecoder(bytes.NewReader(raw))
		token, err := counts.Token()
		if err != nil {
			return State{}, err
		}
		if token != json.Delim('{') {
			return State{}, fmt.Errorf("unknown units must be an object or null")
		}
		v.UnknownUnits = make(map[uint32]int)
		for counts.More() {
			token, err := counts.Token()
			if err != nil {
				return State{}, err
			}
			// Let encoding/json apply the same uint32 map-key rules as Encode.
			key := token.(string)
			var countRaw json.RawMessage
			if err := counts.Decode(&countRaw); err != nil {
				return State{}, err
			}
			if bytes.Equal(bytes.TrimSpace(countRaw), []byte("null")) {
				return State{}, fmt.Errorf("null unknown count")
			}
			entry, err := json.Marshal(map[string]json.RawMessage{key: countRaw})
			if err != nil {
				return State{}, err
			}
			var one map[uint32]int
			if err := json.Unmarshal(entry, &one); err != nil {
				return State{}, err
			}
			for id, count := range one {
				if _, ok := v.UnknownUnits[id]; ok {
					return State{}, fmt.Errorf("duplicate unknown entry %d", id)
				}
				v.UnknownUnits[id] = count
			}
		}
		if _, err := counts.Token(); err != nil {
			return State{}, err
		}
	}
	return State{v}, nil
}

// Restore checks the serialized key before invoking the trusted caller's factory,
// verifies visible static configuration, then attaches copied counters. Neither
// the factory's object nor an existing live Identifier receives restored counts.
func (s State) Restore(recipe TrustedRecipe) (*Identifier, error) {
	if recipe.ID == "" || recipe.ID != s.value.RecipeID {
		return nil, fmt.Errorf("identifier recipe mismatch")
	}
	i, err := recipe.New()
	if err != nil {
		return nil, err
	}
	if i.configuration != s.value.Configuration {
		return nil, fmt.Errorf("identifier configuration mismatch")
	}
	i.unknownUnits = maps.Clone(s.value.UnknownUnits)
	return i, nil
}
