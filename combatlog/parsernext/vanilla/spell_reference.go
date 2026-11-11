package vanilla

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
)

const SpellReferenceType = "parsernext/vanilla.SpellReference"
const SpellReferenceVersion uint32 = 1

// SpellReference identifies immutable effective spell data within ONE compatible
// session resolver context. Dataset content, flavor, custom spells and override
// implementation are caller-owned compatibility invariants checked once above
// this codec. They are not repeated in keys. No difficulty view is selected.
// Same-ID objects intentionally converge even if their original pointers differ.
type SpellReference struct {
	ID chrondbc.SpellID `json:"spell_id"`
}

func (s SpellReference) Encode() ([]byte, error) { return json.Marshal(s) }

func DecodeSpellReference(version uint32, payload []byte) (SpellReference, error) {
	if version != SpellReferenceVersion {
		return SpellReference{}, fmt.Errorf("unsupported spell reference version %d", version)
	}
	var value struct {
		ID *chrondbc.SpellID `json:"spell_id"`
	}
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(&value); err != nil {
		return SpellReference{}, fmt.Errorf("decode spell reference: %w", err)
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return SpellReference{}, fmt.Errorf("trailing spell reference data")
	}
	if value.ID == nil {
		return SpellReference{}, fmt.Errorf("missing or null spell_id")
	}
	// Do not impose positive-ID restrictions: custom synthetic IDs belong to the
	// configured fetcher, not this codec. Nil spells are represented by no reference.
	return SpellReference{ID: *value.ID}, nil
}

// NewSpellDerivation binds the same effective non-counting fetcher used by the
// session. It must already include dataset scoping and single-spell flavor
// overrides. Do not pass the pipeline's diagnostic counting wrapper. No lookup
// occurs during capture; on restore not-found derives UnknownSpell, all other
// errors invalidate restoration. This is deliberately not provenance tracking.
func NewSpellDerivation(fetcher SpellLookup) (stategraph.DerivableType[*chrondbc.Spell], error) {
	if fetcher == nil {
		return stategraph.DerivableType[*chrondbc.Spell]{}, fmt.Errorf("spell fetcher is required")
	}
	return stategraph.DerivableType[*chrondbc.Spell]{
		Type: SpellReferenceType, Version: SpellReferenceVersion, Derivable: true,
		Derive: func(ctx context.Context, payload json.RawMessage) (*chrondbc.Spell, error) {
			key, err := DecodeSpellReference(SpellReferenceVersion, payload)
			if err != nil {
				return nil, err
			}
			spell, err := fetcher.Spell(ctx, key.ID)
			if err != nil {
				if chrondbc.IsSpellNotFound(err) {
					unknown := chrondbc.UnknownSpell(key.ID)
					return &unknown, nil
				}
				return nil, err
			}
			if spell == nil || spell.ID != key.ID {
				return nil, fmt.Errorf("fetcher returned invalid spell for %d", key.ID)
			}
			return spell, nil
		},
	}, nil
}

// CaptureSpellReferences is a bounded spell-only graph adapter, not a pipeline
// snapshot. Reference names are single path components. Canonical values use
// stable numeric spell IDs; no memory addresses or spell contents are persisted.
// Nil spell inputs produce no reference. The caller must preserve that absence
// in its owning DTO and validate session compatibility before restoring.
func CaptureSpellReferences(refs map[string]*chrondbc.Spell) (stategraph.Graph, map[stategraph.Path]stategraph.ValuePayload, error) {
	r, err := stategraph.New("/root")
	if err != nil {
		return stategraph.Graph{}, nil, err
	}
	for _, p := range []string{"/root", "/root/spells", "/root/references"} {
		if err := r.Directory(p, nil); err != nil {
			return stategraph.Graph{}, nil, err
		}
	}
	payloads := make(map[stategraph.Path]stategraph.ValuePayload)
	for name, spell := range refs {
		if name == "" || name == "." || name == ".." || strings.Contains(name, "/") {
			return stategraph.Graph{}, nil, fmt.Errorf("invalid spell reference name %q", name)
		}
		if spell == nil {
			continue
		}
		target := stategraph.Path("/root/spells/" + strconv.FormatInt(int64(spell.ID), 10))
		if _, ok := payloads[target]; !ok {
			payload, err := (SpellReference{ID: spell.ID}).Encode()
			if err != nil {
				return stategraph.Graph{}, nil, err
			}
			if err := r.Value(string(target), SpellReferenceType, nil); err != nil {
				return stategraph.Graph{}, nil, err
			}
			payloads[target] = stategraph.ValuePayload{Type: SpellReferenceType, Version: SpellReferenceVersion, Payload: payload}
		}
		if err := r.Reference("/root/references/"+name, string(target), SpellReferenceType, nil); err != nil {
			return stategraph.Graph{}, nil, err
		}
	}
	graph, err := r.Graph()
	if err != nil {
		return stategraph.Graph{}, nil, err
	}
	return graph, payloads, nil
}
