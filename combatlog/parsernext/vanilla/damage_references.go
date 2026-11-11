package vanilla

import (
	"context"
	"fmt"
	"path"
	"sort"
	"strconv"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
)

// DamageOwner is enumerated by actual pending buffers in stable owner/event
// order. Paths name canonical Values, never Go fields or memory addresses.
type DamageOwner struct {
	Path   stategraph.Path
	Damage *messages.Damage
}

// DamageGraph is a bounded codec fixture/integration surface, not a complete
// session archive. Compatibility is checked once by the enclosing caller.
type DamageGraph struct {
	Graph  stategraph.Graph
	Values map[stategraph.Path]stategraph.ValuePayload
}

// CaptureDamageGraph visits pending owners first, then sorted reference paths.
// Cache-only objects receive retained-damage Values. Pointer identity is used
// only in this call; equal-valued distinct Damage objects remain distinct.
func CaptureDamageGraph(owners []DamageOwner, refs map[stategraph.Path]*messages.Damage, extraSpells ...*chrondbc.Spell) (DamageGraph, error) {
	r, err := stategraph.New("/root")
	if err != nil {
		return DamageGraph{}, err
	}
	dirs := map[string]bool{}
	var directory func(string) error
	directory = func(p string) error {
		if dirs[p] {
			return nil
		}
		if p != "/root" {
			if p == "/" || p == "." {
				return fmt.Errorf("path outside /root")
			}
			if err := directory(path.Dir(p)); err != nil {
				return err
			}
		}
		if err := r.Directory(p, nil); err != nil {
			return err
		}
		dirs[p] = true
		return nil
	}
	if err := directory("/root"); err != nil {
		return DamageGraph{}, err
	}
	values := map[stategraph.Path]stategraph.ValuePayload{}
	registerSpell := func(spell *chrondbc.Spell) (string, error) {
		if spell == nil {
			return "", nil
		}
		spellPath := "/root/spells/" + strconv.FormatInt(int64(spell.ID), 10)
		if _, ok := values[stategraph.Path(spellPath)]; !ok {
			if err := directory("/root/spells"); err != nil {
				return "", err
			}
			if err := r.Value(spellPath, SpellReferenceType, nil); err != nil {
				return "", err
			}
			payload, err := (SpellReference{ID: spell.ID}).Encode()
			if err != nil {
				return "", err
			}
			values[stategraph.Path(spellPath)] = stategraph.ValuePayload{Type: SpellReferenceType, Version: SpellReferenceVersion, Payload: payload}
		}
		return spellPath, nil
	}
	for _, spell := range extraSpells {
		if _, err := registerSpell(spell); err != nil {
			return DamageGraph{}, err
		}
	}
	seen := map[*messages.Damage]stategraph.Path{}
	add := func(p stategraph.Path, d *messages.Damage) error {
		if d == nil {
			return fmt.Errorf("nil canonical damage")
		}
		if err := directory(path.Dir(string(p))); err != nil {
			return err
		}
		if target, ok := seen[d]; ok {
			return r.Reference(string(p), string(target), messages.DamageStateType, nil)
		}
		if err := r.Value(string(p), messages.DamageStateType, nil); err != nil {
			return err
		}
		spellPath, err := registerSpell(d.SpellData)
		if err != nil {
			return err
		}
		if spellPath != "" {
			if err := r.Reference(string(p)+"/spell", spellPath, SpellReferenceType, nil); err != nil {
				return err
			}
		}

		state, err := d.CaptureState(spellPath)
		if err != nil {
			return err
		}
		payload, err := state.Encode()
		if err != nil {
			return err
		}
		values[p] = stategraph.ValuePayload{Type: messages.DamageStateType, Version: messages.DamageStateVersion, Payload: payload}
		seen[d] = p
		return nil
	}
	for _, owner := range owners {
		if err := add(owner.Path, owner.Damage); err != nil {
			return DamageGraph{}, err
		}
	}
	keys := make([]string, 0, len(refs))
	for key := range refs {
		keys = append(keys, string(key))
	}
	sort.Strings(keys)
	for i, key := range keys {
		d := refs[stategraph.Path(key)]
		if d == nil {
			continue
		}
		target, ok := seen[d]
		if !ok {
			target = stategraph.Path(fmt.Sprintf("/root/retained-damage/%08d", i))
			if err := add(target, d); err != nil {
				return DamageGraph{}, err
			}
		}
		if err := directory(path.Dir(key)); err != nil {
			return DamageGraph{}, err
		}
		if err := r.Reference(key, string(target), messages.DamageStateType, nil); err != nil {
			return DamageGraph{}, err
		}
	}
	graph, err := r.Graph()
	if err != nil {
		return DamageGraph{}, err
	}
	return DamageGraph{Graph: graph, Values: values}, nil
}

// Restore validates and builds an isolated candidate graph. Canonical Damage
// objects are allocated once, decoded, then spell and Damage aliases resolved.
// All failure paths discard the candidate; no live owner is modified.
type RestoredDamageGraph struct {
	Damage map[stategraph.Path]*messages.Damage
	Spells map[stategraph.Path]*chrondbc.Spell
}

func (g DamageGraph) Restore(ctx context.Context, fetcher SpellLookup) (map[stategraph.Path]*messages.Damage, error) {
	restored, err := g.RestoreValues(ctx, fetcher)
	if err != nil {
		return nil, err
	}
	return restored.Damage, nil
}

// RestoreValues exposes the same canonical spell table to other retained owners.
func (g DamageGraph) RestoreValues(ctx context.Context, fetcher SpellLookup) (*RestoredDamageGraph, error) {
	if err := g.Graph.Validate(); err != nil {
		return nil, err
	}
	spellType, err := NewSpellDerivation(fetcher)
	if err != nil {
		return nil, err
	}
	states := map[stategraph.Path]messages.DamageState{}
	spells := map[stategraph.Path]*chrondbc.Spell{}
	damage := map[stategraph.Path]*messages.Damage{}
	count := 0
	for _, node := range g.Graph.Nodes {
		if node.Kind != stategraph.KindValue {
			continue
		}
		count++
		payload, ok := g.Values[node.Path]
		if !ok || payload.Type != node.Type {
			return nil, fmt.Errorf("missing or mismatched payload at %s", node.Path)
		}
		switch node.Type {
		case messages.DamageStateType:
			state, err := messages.DecodeDamageState(payload.Version, payload.Payload)
			if err != nil {
				return nil, err
			}
			if state.SpellPath() != "" {
				ref, ok := g.Graph.Find(stategraph.Path(string(node.Path) + "/spell"))
				if !ok || ref.Kind != stategraph.KindReference || ref.Type != SpellReferenceType || string(ref.Target) != state.SpellPath() {
					return nil, fmt.Errorf("invalid damage spell reference at %s", node.Path)
				}
			} else if _, ok := g.Graph.Find(stategraph.Path(string(node.Path) + "/spell")); ok {
				return nil, fmt.Errorf("unexpected damage spell reference")
			}
			states[node.Path] = state
			damage[node.Path] = new(messages.Damage)
		case SpellReferenceType:
			if _, err := DecodeSpellReference(payload.Version, payload.Payload); err != nil {
				return nil, err
			}
		default:
			return nil, fmt.Errorf("unsupported value type %s", node.Type)
		}
	}
	if count != len(g.Values) {
		return nil, fmt.Errorf("unexpected damage graph payloads")
	}
	for _, node := range g.Graph.Nodes {
		if node.Kind == stategraph.KindReference && node.Type != messages.DamageStateType && node.Type != SpellReferenceType {
			return nil, fmt.Errorf("unsupported reference type")
		}
		if node.Kind == stategraph.KindValue && node.Type == SpellReferenceType {
			spell, err := spellType.Derive(ctx, g.Values[node.Path].Payload)
			if err != nil {
				return nil, err
			}
			spells[node.Path] = spell
		}
	}
	for p, state := range states {
		decoded, err := state.Restore(func(p string) (*chrondbc.Spell, error) {
			spell, ok := spells[stategraph.Path(p)]
			if !ok {
				return nil, fmt.Errorf("missing canonical spell %s", p)
			}
			return spell, nil
		})
		if err != nil {
			return nil, err
		}
		*damage[p] = *decoded
	}
	for _, node := range g.Graph.Nodes {
		if node.Kind == stategraph.KindReference && node.Type == messages.DamageStateType {
			damage[node.Path] = damage[node.Target]
		}
	}
	return &RestoredDamageGraph{Damage: damage, Spells: spells}, nil
}
