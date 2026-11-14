package identifier

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"strconv"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const classificationStateType = "identifier.ServerClassification"
const classificationStateVersion uint32 = 1

type classificationValue struct {
	Affiliation types.Affiliation `json:"affiliation"`
	Name        string            `json:"name"`
	Boss        bool              `json:"boss"`
}
type classificationState struct {
	Base    json.RawMessage                `json:"base"`
	Updates map[uint32]classificationValue `json:"updates"`
}

// NewServerClassification explicitly permits server scalar updates. Arbitrary
// AddEntryId mutations remain unsupported. TrustedRecipe's callback immutability
// contract still applies: archive data can never provide or select functions.
func (r TrustedRecipe) NewServerClassification() (*Identifier, error) {
	i, err := r.New()
	if err != nil {
		return nil, err
	}
	i.serverClassification = true
	i.staticEntries = maps.Clone(i.byEntryId)
	i.classificationUpdates = make(map[uint32]classificationValue)
	return i, nil
}

func classificationEntries(base map[uint32]Identity, updates map[uint32]classificationValue) (map[uint32]Identity, error) {
	entries := maps.Clone(base)
	if len(updates) > 0 && entries == nil {
		entries = make(map[uint32]Identity)
	}
	for id, v := range updates {
		identity := entries[id]
		if identity.Boss && !v.Boss {
			return nil, fmt.Errorf("server classification demotes configured boss %d", id)
		}
		if identity.Name != "" && v.Name == "" {
			return nil, fmt.Errorf("server classification clears configured name %d", id)
		}
		identity.Affiliation, identity.Name, identity.Boss = v.Affiliation, v.Name, v.Boss
		entries[id] = identity
	}
	return entries, nil
}

func (i *Identifier) captureClassificationState() ([]byte, error) {
	if i == nil || !i.serverClassification || i.recipeID == "" || i.dynamicallyModified {
		return nil, fmt.Errorf("unbound or unsupported dynamic identifier")
	}
	static := &Identifier{byEntryId: i.staticEntries, unknownUnits: i.unknownUnits, recipeID: i.recipeID, configuration: i.configuration}
	base, err := static.CaptureState()
	if err != nil {
		return nil, err
	}
	expected, err := classificationEntries(i.staticEntries, i.classificationUpdates)
	if err != nil {
		return nil, err
	}
	hash, err := fingerprint(expected)
	if err != nil {
		return nil, err
	}
	actual, err := fingerprint(i.byEntryId)
	if err != nil {
		return nil, err
	}
	if hash != actual {
		return nil, fmt.Errorf("untracked identifier classification mutation")
	}
	encoded, err := base.Encode()
	if err != nil {
		return nil, err
	}
	return json.Marshal(classificationState{Base: encoded, Updates: maps.Clone(i.classificationUpdates)})
}

// strictObject preserves field presence and rejects duplicate/null values before
// decoding. It is deliberately owner-local, not a general serialization layer.
func classificationObject(data []byte) (map[string]json.RawMessage, error) {
	d := json.NewDecoder(bytes.NewReader(data))
	tok, err := d.Token()
	if err != nil || tok != json.Delim('{') {
		return nil, fmt.Errorf("expected classification object")
	}
	fields := map[string]json.RawMessage{}
	for d.More() {
		tok, err := d.Token()
		if err != nil {
			return nil, err
		}
		key := tok.(string)
		if _, ok := fields[key]; ok {
			return nil, fmt.Errorf("duplicate classification field %q", key)
		}
		var value json.RawMessage
		if err := d.Decode(&value); err != nil {
			return nil, err
		}
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, fmt.Errorf("null classification field %q", key)
		}
		fields[key] = value
	}
	if _, err := d.Token(); err != nil {
		return nil, err
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, fmt.Errorf("trailing classification data")
	}
	return fields, nil
}

func restoreClassificationState(v uint32, b []byte, baseline *Identifier) (*Identifier, error) {
	if v != classificationStateVersion {
		return nil, fmt.Errorf("unsupported classification version")
	}
	fields, err := classificationObject(b)
	if err != nil {
		return nil, err
	}
	if len(fields) != 2 || fields["base"] == nil || fields["updates"] == nil {
		return nil, fmt.Errorf("invalid classification fields")
	}
	base, err := DecodeState(StateVersion, fields["base"])
	if err != nil {
		return nil, err
	}
	if base.value.RecipeID != baseline.recipeID || base.value.Configuration != baseline.configuration {
		return nil, fmt.Errorf("classification recipe/configuration mismatch")
	}
	raw, err := classificationObject(fields["updates"])
	if err != nil {
		return nil, err
	}
	updates := make(map[uint32]classificationValue, len(raw))
	for key, value := range raw {
		id, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			return nil, err
		}
		if _, ok := updates[uint32(id)]; ok {
			return nil, fmt.Errorf("duplicate classification entry")
		}
		f, err := classificationObject(value)
		if err != nil {
			return nil, err
		}
		if len(f) != 3 || f["affiliation"] == nil || f["name"] == nil || f["boss"] == nil {
			return nil, fmt.Errorf("invalid classification update")
		}
		var update classificationValue
		if err := json.Unmarshal(value, &update); err != nil {
			return nil, err
		}
		updates[uint32(id)] = update
	}
	entries, err := classificationEntries(baseline.staticEntries, updates)
	if err != nil {
		return nil, err
	}
	return &Identifier{byEntryId: entries, unknownUnits: maps.Clone(base.value.UnknownUnits), recipeID: baseline.recipeID, configuration: baseline.configuration, serverClassification: true, staticEntries: maps.Clone(baseline.staticEntries), classificationUpdates: updates}, nil
}

// RegisterServerClassificationGraphOwner binds static callbacks at registration,
// never during restore. Register this OR RegisterGraphOwner for an Identifier;
// the default static codec remains unchanged and rejects server updates.
func RegisterServerClassificationGraphOwner(r *ownergraph.Registry, recipes ...TrustedRecipe) error {
	if len(recipes) == 0 {
		return fmt.Errorf("at least one server classification recipe required")
	}
	baselines := make(map[string]*Identifier, len(recipes))
	for _, recipe := range recipes {
		if _, exists := baselines[recipe.ID]; exists {
			return fmt.Errorf("duplicate server classification recipe %q", recipe.ID)
		}
		baseline, err := recipe.NewServerClassification()
		if err != nil {
			return err
		}
		baselines[recipe.ID] = baseline
	}
	return ownergraph.Register(r, ownergraph.Codec[Identifier]{Type: classificationStateType, Version: classificationStateVersion, Init: func() *Identifier { return new(Identifier) },
		Capture: func(i *Identifier, _ *ownergraph.Capture) ([]byte, error) {
			baseline := baselines[i.recipeID]
			if baseline == nil || i.configuration != baseline.configuration {
				return nil, fmt.Errorf("classification registration recipe mismatch")
			}
			return i.captureClassificationState()
		}, Restore: func(i *Identifier, v uint32, b []byte, _ *ownergraph.Restore) error {
			fields, err := classificationObject(b)
			if err != nil {
				return err
			}
			base, err := DecodeState(StateVersion, fields["base"])
			if err != nil {
				return err
			}
			baseline := baselines[base.value.RecipeID]
			if baseline == nil {
				return fmt.Errorf("unknown server classification recipe %q", base.value.RecipeID)
			}
			next, err := restoreClassificationState(v, b, baseline)
			if err != nil {
				return err
			}
			*i = *next
			return nil
		}})
}
