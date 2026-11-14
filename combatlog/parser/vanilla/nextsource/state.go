package nextsource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/database"
	"io"
	"log/slog"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
)

// Compatibility is the snapshot header. Runtime identity must also be bound at
// construction with snapshot.WithCompatibility; a capture-only claim is rejected.
type Compatibility struct {
	DatasetID       string             `json:"dataset_id"`
	DatasetRevision int64              `json:"dataset_revision"`
	BuildIdentity   string             `json:"build_identity"`
	Format          database.LogFormat `json:"format"`
	Flavor          string             `json:"flavor"`
	// BuildVersion is HEADER display metadata, never the executable identity.
	BuildVersion          string `json:"build_version"`
	CustomOverrideVersion string `json:"custom_override_version"`
}

func (c Compatibility) RuntimeIdentity() snapshot.Compatibility {
	return snapshot.Compatibility{DatasetID: c.DatasetID, DatasetRevision: c.DatasetRevision, BuildIdentity: c.BuildIdentity, Format: string(c.Format), Flavor: c.Flavor}
}
func (c Compatibility) validate() error {
	if err := c.RuntimeIdentity().Validate(); err != nil {
		return err
	}
	if c.CustomOverrideVersion == "" {
		return fmt.Errorf("custom override identity required")
	}
	return nil
}

// constructionIdentity checks trusted context before New can initialize any
// synthetic owner or look up dependency data. Missing binding permits ordinary
// parsing, but can never capture or restore a snapshot.
func constructionIdentity(ctx context.Context) (*snapshot.Compatibility, error) {
	identity, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, nil
	}
	if err := identity.Validate(); err != nil {
		return nil, err
	}
	metadata, ok := parsectx.FromContext(ctx)
	if !ok || string(metadata.Format) != identity.Format || metadata.Flavor.CanonicalKey() != identity.Flavor {
		return nil, fmt.Errorf("snapshot identity differs from construction format/flavor")
	}
	if metadata.DatasetID.String() != "00000000-0000-0000-0000-000000000000" && metadata.DatasetID.String() != identity.DatasetID {
		return nil, fmt.Errorf("snapshot identity differs from construction dataset")
	}
	return &identity, nil
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

// Version 2 requires exact executable and revision-bound dataset identity.
const StateVersion uint32 = 2
const pipelineType = "vanilla/nextsource.Pipeline"

type pipelineValue struct {
	BuildVersion string                           `json:"build_version"`
	Missed       map[chrondbc.SpellID]MissedSpell `json:"missed"`
}

// CaptureState requires successful EOF, not merely the last record returned.
// External owners are ordered pending-buffer canonical Damage paths. Their
// aliases stay shared with Slain. Caller snapshots the external owners separately.
func (p *Pipeline) CaptureState(identity Compatibility, owners []next.DamageOwner) (State, error) {
	if !p.boundary || p.failed || p.graphPending || !p.completedFile || p.activeSource != nil {
		return State{}, fmt.Errorf("pipeline is not at a successful complete-file boundary")
	}
	if err := identity.validate(); err != nil {
		return State{}, err
	}
	if p.construction == nil {
		return State{}, fmt.Errorf("snapshot construction identity required")
	}
	if err := p.construction.Check(identity.RuntimeIdentity()); err != nil {
		return State{}, err
	}
	if p.identity != nil && *p.identity != identity {
		return State{}, fmt.Errorf("pipeline compatibility identity changed")
	}
	if identity.Format != p.format || identity.Flavor != p.flavor || identity.BuildVersion != p.buildVersion {
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

// RestoreState is the legacy source-only, DB-backed convenience restore, not a
// semantic session restore. It checks compatibility, privately constructs owners,
// immediately wires runtime dependencies, and returns a ready-to-process pipeline
// and canonical Damage table for external buffers. No explicit wiring is needed.
// Construction and retained spell derivation may query db. Caller must pass the
// same effective flavor-overridden non-counting GameDB.
// Full session checkpoints must instead use the prepared ownergraph path via
// RegisterGraphOwner, followed by explicit WireGraphRuntime after validation.
// Diagnostic wall-clock timings restart; missed-spell counts are retained.
func RestoreState(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver, expected Compatibility, state State) (*Pipeline, map[stategraph.Path]*messages.Damage, error) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	fail := func(err error) (*Pipeline, map[stategraph.Path]*messages.Damage, error) { return nil, nil, err }
	if err := expected.validate(); err != nil {
		return fail(err)
	}
	construction, err := constructionIdentity(ctx)
	if err != nil {
		return fail(err)
	}
	if construction == nil {
		return fail(fmt.Errorf("snapshot construction identity required"))
	}
	if err := construction.Check(expected.RuntimeIdentity()); err != nil {
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
	if pv.BuildVersion != expected.BuildVersion {
		return fail(fmt.Errorf("source build version differs from trusted construction"))
	}
	decoderPayload, ok := state.Values["/root/decoder"]
	if !ok {
		return fail(fmt.Errorf("missing decoder state"))
	}
	decoder, err := next.DecodeDecoderState(decoderPayload.Version, decoderPayload.Payload)
	if err != nil {
		return fail(err)
	}
	candidate, err := New(ctx, logger, db, gear, expected.BuildVersion)
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
	restoredDecoder, err := decoder.Restore(db, expected.BuildVersion, options)
	if err != nil {
		return fail(err)
	}
	bound := expected
	candidate.identity = &bound
	candidate.completedFile = true
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
