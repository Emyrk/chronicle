package nextsource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
)

// Compatibility is a caller-attested identity, NOT a checksum computed here.
// DatasetContent must identify immutable content (a UUID alone is insufficient).
// Never supply connection strings, credentials, or host-local file paths.
// Format/Flavor must match construction; all fields are checked once at restore.
type Compatibility struct {
	DatasetContent        string `json:"dataset_content"`
	Format                string `json:"format"`
	Flavor                string `json:"flavor"`
	ParserVersion         string `json:"parser_version"`
	CustomOverrideVersion string `json:"custom_override_version"`
}

func (c Compatibility) validate() error {
	if c.DatasetContent == "" || c.Format == "" || c.Flavor == "" || c.ParserVersion == "" || c.CustomOverrideVersion == "" {
		return fmt.Errorf("complete immutable compatibility identity required")
	}
	return nil
}

// State is ONE typed graph plus its semantic Value payloads and compatibility
// header. It is only a message-source snapshot, not consumers/session state or a
// persisted archive protocol. Fields are detached and validated on restoration.
type State struct {
	Version       uint32                                      `json:"version"`
	Compatibility Compatibility                               `json:"compatibility"`
	Graph         stategraph.Graph                            `json:"graph"`
	Values        map[stategraph.Path]stategraph.ValuePayload `json:"values"`
}

const StateVersion uint32 = 1
const pipelineType = "vanilla/nextsource.Pipeline"

type pipelineValue struct {
	BuildVersion string                           `json:"build_version"`
	Missed       map[chrondbc.SpellID]MissedSpell `json:"missed"`
}

// CaptureState requires successful EOF, not merely the last record returned.
// External owners are ordered pending-buffer canonical Damage paths. Their
// aliases stay shared with Slain. Caller snapshots the external owners separately.
func (p *Pipeline) CaptureState(identity Compatibility, owners []next.DamageOwner) (State, error) {
	if !p.boundary {
		return State{}, fmt.Errorf("pipeline is not at a successful complete-file boundary")
	}
	if err := identity.validate(); err != nil {
		return State{}, err
	}
	if p.identity != nil && *p.identity != identity {
		return State{}, fmt.Errorf("pipeline compatibility identity changed")
	}
	if identity.Format != p.format || identity.Flavor != p.flavor {
		return State{}, fmt.Errorf("compatibility differs from pipeline construction")
	}
	refs := map[stategraph.Path]*messages.Damage{}
	var spells []*chrondbc.Spell
	values, err := p.synthetics.CaptureValues(func(target guid.GUID, d *messages.Damage) (string, error) {
		path := stategraph.Path("/root/slain-damage/" + target.String())
		refs[path] = d
		return string(path), nil
	}, func(s *chrondbc.Spell) (string, error) {
		spells = append(spells, s)
		return "/root/spells/" + strconv.FormatInt(int64(s.ID), 10), nil
	})
	if err != nil {
		return State{}, err
	}
	graph, err := next.CaptureDamageGraph(owners, refs, spells...)
	if err != nil {
		return State{}, err
	}
	for path, payload := range graph.Values {
		values[path] = payload
	}
	decoder, err := p.decoder.CaptureState().Encode()
	if err != nil {
		return State{}, err
	}
	values["/root/decoder"] = stategraph.ValuePayload{Type: next.DecoderStateType, Version: next.DecoderStateVersion, Payload: decoder}
	source, err := json.Marshal(pipelineValue{BuildVersion: p.buildVersion, Missed: p.MissedSpells()})
	if err != nil {
		return State{}, err
	}
	values["/root/source"] = stategraph.ValuePayload{Type: pipelineType, Version: 1, Payload: source}
	registry, err := stategraph.New("/root")
	if err != nil {
		return State{}, err
	}
	for _, node := range graph.Graph.Nodes {
		switch node.Kind {
		case stategraph.KindDirectory:
			err = registry.Directory(string(node.Path), nil)
		case stategraph.KindValue:
			err = registry.Value(string(node.Path), node.Type, nil)
		case stategraph.KindReference:
			err = registry.Reference(string(node.Path), string(node.Target), node.Type, nil)
		}
		if err != nil {
			return State{}, err
		}
	}
	if err := registry.Directory("/root/synthetics", nil); err != nil {
		return State{}, err
	}
	for path, payload := range values {
		if _, ok := graph.Values[path]; !ok {
			if err := registry.Value(string(path), payload.Type, nil); err != nil {
				return State{}, err
			}
		}
	}
	combined, err := registry.Graph()
	if err != nil {
		return State{}, err
	}
	bound := identity
	p.identity = &bound
	return State{Version: StateVersion, Compatibility: identity, Graph: combined, Values: values}, nil
}

// RestoreState checks the context once, restores all candidate owners privately,
// then returns the new pipeline and canonical Damage table for external buffers.
// Caller must pass the same effective flavor-overridden non-counting GameDB.
// Diagnostic wall-clock timings restart; missed-spell counts are retained.
func RestoreState(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver, expected Compatibility, state State) (*Pipeline, map[stategraph.Path]*messages.Damage, error) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	fail := func(err error) (*Pipeline, map[stategraph.Path]*messages.Damage, error) { return nil, nil, err }
	if err := expected.validate(); err != nil {
		return fail(err)
	}
	if state.Version != StateVersion || state.Compatibility != expected {
		return fail(fmt.Errorf("incompatible pipeline snapshot"))
	}
	if err := state.Graph.Validate(); err != nil {
		return fail(err)
	}
	graph := next.DamageGraph{Graph: stategraph.Graph{Version: stategraph.FormatVersion, Root: state.Graph.Root}, Values: map[stategraph.Path]stategraph.ValuePayload{}}
	syntheticValues := map[stategraph.Path]stategraph.ValuePayload{}
	count := 0
	for _, node := range state.Graph.Nodes {
		if node.Kind != stategraph.KindValue {
			graph.Graph.Nodes = append(graph.Graph.Nodes, node)
			continue
		}
		count++
		payload, ok := state.Values[node.Path]
		if !ok || payload.Type != node.Type {
			return fail(fmt.Errorf("missing or mismatched pipeline payload at %s", node.Path))
		}
		switch {
		case node.Path == "/root/decoder":
			if payload.Type != next.DecoderStateType {
				return fail(fmt.Errorf("invalid decoder type"))
			}
		case node.Path == "/root/source":
			if payload.Type != pipelineType || payload.Version != 1 {
				return fail(fmt.Errorf("invalid source type/version"))
			}
		case strings.HasPrefix(string(node.Path), "/root/synthetics/"):
			syntheticValues[node.Path] = payload
		default:
			graph.Graph.Nodes = append(graph.Graph.Nodes, node)
			graph.Values[node.Path] = payload
		}
	}
	if count != len(state.Values) {
		return fail(fmt.Errorf("unexpected pipeline payloads"))
	}
	source, ok := state.Values["/root/source"]
	if !ok {
		return fail(fmt.Errorf("missing source state"))
	}
	var pv pipelineValue
	if err := strictPipelineValue(source.Payload, &pv); err != nil {
		return fail(err)
	}
	decoderPayload, ok := state.Values["/root/decoder"]
	if !ok {
		return fail(fmt.Errorf("missing decoder state"))
	}
	decoder, err := next.DecodeDecoderState(decoderPayload.Version, decoderPayload.Payload)
	if err != nil {
		return fail(err)
	}
	candidate, err := New(ctx, logger, db, gear, pv.BuildVersion)
	if err != nil {
		return fail(err)
	}
	if candidate.format != expected.Format || candidate.flavor != expected.Flavor {
		return fail(fmt.Errorf("restore construction differs from compatibility"))
	}
	objects, err := graph.RestoreValues(ctx, db)
	if err != nil {
		return fail(err)
	}
	if _, ok := syntheticValues["/root/synthetics/aura-owner"]; !ok {
		return fail(fmt.Errorf("missing required CC-v2 aura owner"))
	}
	synthetics, err := synthetic.RestoreValues(ctx, logger, db, syntheticValues, func(p string) (*messages.Damage, error) {
		d, ok := objects.Damage[stategraph.Path(p)]
		if !ok {
			return nil, fmt.Errorf("missing Damage reference %s", p)
		}
		return d, nil
	}, func(p string) (*chrondbc.Spell, error) {
		s, ok := objects.Spells[stategraph.Path(p)]
		if !ok {
			return nil, fmt.Errorf("missing spell reference %s", p)
		}
		return s, nil
	})
	if err != nil {
		return fail(err)
	}
	options := next.DecoderOptions{CountedSpells: candidate}
	// Reuse construction's runtime gear/talent/logger inputs, not serialized data.
	options.Combatants = decoderRuntimeOptions(ctx, logger, gear)
	restoredDecoder, err := decoder.Restore(db, pv.BuildVersion, options)
	if err != nil {
		return fail(err)
	}
	bound := expected
	candidate.identity = &bound
	candidate.decoder = restoredDecoder
	candidate.synthetics = synthetics
	if pv.Missed != nil {
		candidate.missed = pv.Missed
	}
	return candidate, objects.Damage, nil
}

func decoderRuntimeOptions(ctx context.Context, logger *slog.Logger, gear gamedb.GearResolver) next.CombatantOptions {
	_, trees := parsectx.DatasetTalents(ctx)
	return next.CombatantOptions{TalentTrees: trees, Gear: gear, Logger: logger}
}
func strictPipelineValue(payload []byte, out *pipelineValue) error {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(out); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing source value")
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return err
	}
	for _, key := range []string{"build_version", "missed"} {
		if _, ok := fields[key]; !ok {
			return fmt.Errorf("missing source field %s", key)
		}
	}
	return nil
}

func (s State) Encode() ([]byte, error) { return json.Marshal(s) }

// DecodeState rejects unknown envelope/node fields; runtime compatibility and
// owner validation remain RestoreState's responsibility.
func DecodeState(payload []byte) (State, error) {
	var s State
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&s); err != nil {
		return State{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return State{}, fmt.Errorf("trailing pipeline state")
	}
	if s.Version != StateVersion {
		return State{}, fmt.Errorf("unsupported pipeline state version")
	}
	if err := s.Compatibility.validate(); err != nil {
		return State{}, err
	}
	if err := s.Graph.Validate(); err != nil {
		return State{}, err
	}
	if s.Values == nil {
		return State{}, fmt.Errorf("missing pipeline values")
	}
	return s, nil
}
