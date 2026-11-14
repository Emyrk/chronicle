package chronicle

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"slices"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore"
	"github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/common/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/messagesource"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	nextvanilla "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

// CompleteSessionOptions contains caller-preloaded dependencies and explicitly
// registered production recipes. Each session allocates a fresh graph. Input and
// destination IO are caller-supplied; this facade performs no storage lookup,
// dataset loading, publication, or worker selection.
type CompleteSessionOptions struct {
	Compatibility SessionCompatibility
	// Bundles declares ordered future inputs. On restore, supply only the suffix;
	// completed inputs are authoritative checkpoint provenance, not revalidated.
	Bundles []CompleteBundle
	// Files is an artifact-free compatibility shorthand; do not set with Bundles.
	Files    []CompleteFile
	Logger   *slog.Logger
	GameDB   gamedb.GameDB
	Gear     gamedb.GearResolver
	Registry *registry.Registry
	Prepared *registry.PreparedGraph
	// PreparedSpells are effective, override-applied data. Keep dependencies immutable.
	PreparedSpells map[chrondbc.SpellID]*chrondbc.Spell
}

// CompleteFileSession is serial-use only. Any failed operation invalidates it.
// Successful EOF is a checkpoint boundary, never an encounter Finalize.
type CompleteFileSession struct {
	options    CompleteSessionOptions
	root       *completeSessionRoot
	completed  int
	bundles    []CompleteBundle
	next       int
	provenance []CompleteBundle
	processing bool
	failed     error
	finalized  bool
	pending    bool
}

func validateCompleteSessionOptions(o CompleteSessionOptions) error {
	if err := o.Compatibility.validate(); err != nil {
		return err
	}
	if _, err := sessionBundles(o); err != nil {
		return err
	}
	if o.Prepared == nil || o.GameDB == nil || o.Logger == nil || o.Registry == nil || o.Prepared.RecipeID() != o.Compatibility.Recipe {
		return fmt.Errorf("incomplete session dependencies or recipe mismatch")
	}
	switch o.Compatibility.Source.Format {
	case database.LogFormat112aCcAddon, database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc, database.LogFormatAzerothcoreMod:
	case database.LogFormat112aSuperwowAddon:
		return fmt.Errorf("obsolete superwow format is intentionally excluded from complete sessions")
	default:
		return fmt.Errorf("unsupported complete-file format")
	}
	return nil
}
func prepareCompleteSession(o CompleteSessionOptions, graph *ownergraph.Registry, state *encounters.State) error {
	if err := nextvanilla.RegisterPreparedSpellGraphOwner(graph, o.Compatibility.Source.RuntimeIdentity(), o.PreparedSpells); err != nil {
		return err
	}
	if err := o.Prepared.RegisterOwners(graph, o.Compatibility.Source.RuntimeIdentity(), state); err != nil {
		return err
	}
	if err := registerCompleteSessionRoot(graph, o.Compatibility); err != nil {
		return err
	}
	recipes := []consumers.GraphRecipe{{ID: "encounters", Validate: func(c consumers.Consumer) error {
		if _, ok := c.(*encounters.State); !ok {
			return fmt.Errorf("wrong encounters consumer")
		}
		return nil
	}}}
	if o.Compatibility.IdentityMode {
		if err := creatures.RegisterGraphOwner(graph); err != nil {
			return err
		}
		recipes = append(recipes, consumers.GraphRecipe{ID: "identity", Validate: func(c consumers.Consumer) error {
			if _, ok := c.(*creatures.Creatures); !ok {
				return fmt.Errorf("wrong identity consumer")
			}
			return nil
		}})
	}
	if err := consumers.RegisterGraphOwner(graph, recipes); err != nil {
		return err
	}
	switch o.Compatibility.Source.Format {
	case database.LogFormat112aCcAddon:
		return nextsource.RegisterGraphOwner(graph, o.Compatibility.Source)
	case database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
		return wotlk.RegisterNextPipelineGraphOwner(graph, o.Compatibility.Source.RuntimeIdentity())
	case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
		return modern.RegisterNextPipelineGraphOwner(graph, o.Compatibility.Source.RuntimeIdentity())
	case database.LogFormatAzerothcoreMod:
		return azerothcore.RegisterNextPipelineGraphOwner(graph, o.Compatibility.Source.RuntimeIdentity())
	default:
		return fmt.Errorf("unsupported complete-file format")
	}
}
func NewCompleteFileSession(ctx context.Context, o CompleteSessionOptions) (*CompleteFileSession, error) {
	if err := validateCompleteSessionOptions(o); err != nil {
		return nil, err
	}
	actual, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("session construction identity required")
	}
	if err := o.Compatibility.Source.RuntimeIdentity().Check(actual); err != nil {
		return nil, err
	}
	metadata, ok := parsectx.FromContext(ctx)
	if !ok || metadata.Format != o.Compatibility.Source.Format || metadata.Flavor.CanonicalKey() != o.Compatibility.Source.Flavor {
		return nil, fmt.Errorf("session format/flavor context mismatch")
	}
	if id := metadata.DatasetID.String(); id != "00000000-0000-0000-0000-000000000000" && id != o.Compatibility.Source.DatasetID {
		return nil, fmt.Errorf("session dataset context mismatch")
	}
	state, err := o.Prepared.NewEncounterState(ctx, o.Logger)
	if err != nil {
		return nil, err
	}
	graph := ownergraph.NewRegistry()
	if err := prepareCompleteSession(o, graph, state); err != nil {
		return nil, err
	}
	result := &parseResult{encountersState: state, logCapabilities: initialLogCapabilities(o.Compatibility.Source.Format)}
	if o.Compatibility.Realm != "" {
		state.CurrentRealm = &realm.Info{RealmName: o.Compatibility.Realm}
	}
	if o.Compatibility.IdentityMode {
		result.creaturesState = creatures.New(o.Logger)
		result.consumers = consumers.New(o.Logger, state, result.creaturesState)
	} else {
		result.consumers = consumers.New(o.Logger, state)
	}
	var source any
	switch o.Compatibility.Source.Format {
	case database.LogFormat112aCcAddon:
		source, err = nextsource.New(ctx, o.Logger, o.GameDB, o.Gear, o.Compatibility.Source.BuildVersion)
	case database.LogFormat243CcAddon, database.LogFormat335aCcAddon:
		source, err = wotlk.NewNextPipeline(ctx, o.Logger, o.GameDB, o.Gear, o.Registry)
	case database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
		source, err = modern.NewNextPipeline(ctx, o.Logger, o.GameDB, o.Gear, o.Registry)
	case database.LogFormatAzerothcoreMod:
		source, err = azerothcore.NewNextPipeline(ctx, o.Logger, o.GameDB, o.Gear)
	}
	if err != nil {
		return nil, err
	}
	bundles, err := sessionBundles(o)
	if err != nil {
		return nil, err
	}
	o.Files = append([]CompleteFile(nil), o.Files...)
	o.Bundles = cloneCompleteBundles(o.Bundles)
	return &CompleteFileSession{options: o, root: &completeSessionRoot{source: source, result: result}, bundles: bundles}, nil
}

// RestoreCompleteFileSession accepts only future input descriptors in options.
// Saved inputs are provenance: their current existence or contents are irrelevant.
// It decodes and validates only. It does not attach
// runtime callbacks or execute gameplay; call WireRuntime separately.
func RestoreCompleteFileSession(input io.Reader, o CompleteSessionOptions) (*CompleteFileSession, error) {
	bundles, err := sessionBundles(o)
	if err != nil {
		return nil, err
	}
	env, err := readCheckpoint(input, o.Compatibility, bundles)
	if err != nil {
		return nil, err
	}
	if err := validateCompleteSessionOptions(o); err != nil {
		return nil, err
	}
	graph := ownergraph.NewRegistry()
	if err := prepareCompleteSession(o, graph, nil); err != nil {
		return nil, err
	}
	restored, err := graph.Restore(env.Graph)
	if err != nil {
		return nil, err
	}
	root, ok := restored.(*completeSessionRoot)
	if !ok {
		return nil, fmt.Errorf("wrong checkpoint root")
	}
	o.Files = append([]CompleteFile(nil), o.Files...)
	o.Bundles = cloneCompleteBundles(o.Bundles)
	return &CompleteFileSession{options: o, root: root, completed: len(env.Bundles), pending: true, bundles: bundles, provenance: cloneCompleteBundles(env.Bundles)}, nil
}
func (s *CompleteFileSession) invalidate(err error) error {
	if err != nil {
		s.failed = err
	}
	return err
}
func (s *CompleteFileSession) usable() error {
	if s.processing {
		return fmt.Errorf("session is processing a complete file bundle")
	}
	if s.failed != nil {
		return fmt.Errorf("session invalid: %w", s.failed)
	}
	if s.finalized {
		return fmt.Errorf("session finalized")
	}
	if s.pending {
		return fmt.Errorf("session runtime not wired")
	}
	return nil
}
func (s *CompleteFileSession) WireRuntime(ctx context.Context) error {
	if s.failed != nil || s.finalized || !s.pending {
		return s.invalidate(fmt.Errorf("session is not awaiting wiring"))
	}
	o := s.options
	var err error
	switch p := s.root.source.(type) {
	case *nextsource.Pipeline:
		err = p.ValidateGraphRuntime(ctx, o.GameDB)
	case *azerothcore.NextPipeline:
		err = p.ValidateGraphRuntime(ctx, o.GameDB)
	case *wotlk.NextPipeline:
		err = p.ValidateGraphRuntime(ctx, o.GameDB, o.Registry)
	case *modern.NextPipeline:
		err = p.ValidateGraphRuntime(ctx, o.GameDB, o.Registry)
	}
	if err != nil {
		return s.invalidate(err)
	}
	if err = s.root.result.encountersState.ValidateGraphRuntime(ctx, o.Logger); err != nil {
		return s.invalidate(err)
	}
	if c := s.root.result.creaturesState; c != nil {
		if err = c.ValidateGraphRuntime(o.Logger); err != nil {
			return s.invalidate(err)
		}
	}
	// All dependency preflight precedes all runtime attachment.
	runtime := []consumers.GraphRuntime{{ID: "encounters", Preflight: func(c consumers.Consumer) error { return c.(*encounters.State).ValidateGraphRuntime(ctx, o.Logger) }, Wire: func(c consumers.Consumer) error { return c.(*encounters.State).WireGraphRuntime(ctx, o.Logger) }}}
	if s.root.result.creaturesState != nil {
		runtime = append(runtime, consumers.GraphRuntime{ID: "identity", Preflight: func(c consumers.Consumer) error { return c.(*creatures.Creatures).ValidateGraphRuntime(o.Logger) }, Wire: func(c consumers.Consumer) error { return c.(*creatures.Creatures).WireGraphRuntime(o.Logger) }})
	}
	if err = s.root.result.consumers.WireGraphRuntime(o.Logger, runtime); err != nil {
		return s.invalidate(err)
	}
	switch p := s.root.source.(type) {
	case *nextsource.Pipeline:
		err = p.WireGraphRuntime(ctx, o.Logger, o.GameDB, o.Gear)
	case *azerothcore.NextPipeline:
		err = p.WireGraphRuntime(ctx, o.Logger, o.GameDB, o.Gear)
	case *wotlk.NextPipeline:
		err = p.WireGraphRuntime(ctx, o.Logger, o.GameDB, o.Gear, o.Registry)
	case *modern.NextPipeline:
		err = p.WireGraphRuntime(ctx, o.Logger, o.GameDB, o.Gear, o.Registry)
	}
	if err != nil {
		return s.invalidate(err)
	}
	s.pending = false
	return nil
}

// ProcessFiles consumes caller-associated complete logical files serially. A
// storage append part is not a complete file. Inputs remain caller-owned and are
// never closed. Each successful whole bundle advances the checkpoint prefix.
func (s *CompleteFileSession) ProcessFiles(ctx context.Context, inputs []FileBundle) error {
	if err := s.usable(); err != nil {
		return s.invalidate(err)
	}
	for _, input := range inputs {
		if err := s.processBundle(ctx, input); err != nil {
			return s.invalidate(err)
		}
	}
	return nil
}

// ProcessFile is the artifact-free convenience form of ProcessFiles.
func (s *CompleteFileSession) ProcessFile(ctx context.Context, file CompleteFile, input io.Reader) error {
	return s.ProcessFiles(ctx, []FileBundle{{File: file, Input: input}})
}

func (s *CompleteFileSession) processBundle(ctx context.Context, bundle FileBundle) error {
	if s.next >= len(s.bundles) || bundle.Input == nil {
		return fmt.Errorf("file does not match next immutable descriptor")
	}
	expected := s.bundles[s.next]
	if bundle.File != expected.File || len(bundle.Artifacts) != len(expected.Artifacts) {
		return fmt.Errorf("file/artifacts do not match next immutable bundle")
	}
	for i, input := range bundle.Artifacts {
		if input.Input == nil || input.Artifact != expected.Artifacts[i] {
			return fmt.Errorf("artifact does not match next immutable descriptor at %d", i)
		}
	}
	s.processing = true
	defer func() { s.processing = false }()
	file, input := bundle.File, bundle.Input

	hash := sha256.New()
	counter := &checkpointCountingReader{r: io.TeeReader(input, hash)}
	var source consumers.Advancer
	var err error
	switch p := s.root.source.(type) {
	case *nextsource.Pipeline:
		source, err = p.OpenFile(counter, 4<<20)
	case *wotlk.NextPipeline:
		source, err = p.OpenFile(counter)
	case *modern.NextPipeline:
		source, err = p.OpenFile(counter)
	case *azerothcore.NextPipeline:
		source, err = p.OpenFile(counter)
	}
	if err != nil {
		return s.invalidate(err)
	}
	s.root.result.consumers.Advancer = source
	merged := source
	var artifacts *bundleSidekickSource
	if s.options.Compatibility.Source.Format == database.LogFormat335aCcAddon && len(bundle.Artifacts) > 0 {
		artifacts = &bundleSidekickSource{inputs: bundle.Artifacts}
		merged = messagesource.NewInserter(source, artifacts)
	}
	err = s.root.result.consumers.ConsumeAll(ctx, merged)
	s.root.result.consumers.Advancer = nil
	if err != nil {
		return s.invalidate(err)
	}
	if counter.n != file.Size || hex.EncodeToString(hash.Sum(nil)) != file.SHA256 {
		return s.invalidate(fmt.Errorf("complete-file content mismatch"))
	}
	if artifacts == nil {
		if err := verifyIgnoredArtifacts(ctx, bundle.Artifacts); err != nil {
			return err
		}
	}
	resources := slices.Contains(s.root.result.logCapabilities, "unit-resources")
	position := slices.Contains(s.root.result.logCapabilities, "unit-position")
	if artifacts != nil {
		resources = resources || artifacts.resources
		position = position || artifacts.position
	}
	switch p := s.root.source.(type) {
	case *nextsource.Pipeline:
		s.root.result.report.totalLines += source.(*nextsource.Source).Summary().Lines
		observed := p.Capabilities()
		s.root.result.logCapabilities = initialLogCapabilities(s.options.Compatibility.Source.Format)
		if observed.RaidGroup {
			s.root.result.logCapabilities = append(s.root.result.logCapabilities, "raidgroup")
		}
		s.root.result.logCapabilities = append(s.root.result.logCapabilities, observedUnitTelemetryCapabilities(observed.UnitResources, observed.UnitPosition)...)
	case *wotlk.NextPipeline:
		s.root.result.logCapabilities = initialLogCapabilities(s.options.Compatibility.Source.Format)
		s.root.result.report.totalLines = p.Metrics().TotalLinesParsed
		if p.SawRaidGroup() {
			s.root.result.logCapabilities = append(s.root.result.logCapabilities, "raidgroup")
		}
	case *azerothcore.NextPipeline:
		s.root.result.logCapabilities = initialLogCapabilities(s.options.Compatibility.Source.Format)
		s.root.result.report.totalLines = p.Metrics().TotalLinesParsed
	case *modern.NextPipeline:
		s.root.result.logCapabilities = initialLogCapabilities(s.options.Compatibility.Source.Format)
		s.root.result.report.totalLines = p.Metrics().TotalLinesParsed
		if p.SawRaidGroup() {
			s.root.result.logCapabilities = append(s.root.result.logCapabilities, "raidgroup")
		}
	}
	switch s.options.Compatibility.Source.Format {
	case database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc:
		s.root.result.logCapabilities = append(s.root.result.logCapabilities, "interrupt")
	case database.LogFormatAzerothcoreMod:
		s.root.result.logCapabilities = append(s.root.result.logCapabilities, "interrupt", "server-side")
	}
	for _, capability := range observedUnitTelemetryCapabilities(resources, position) {
		if !slices.Contains(s.root.result.logCapabilities, capability) {
			s.root.result.logCapabilities = append(s.root.result.logCapabilities, capability)
		}
	}
	if s.failed != nil {
		return fmt.Errorf("session invalidated during bundle processing: %w", s.failed)
	}
	s.provenance = append(s.provenance, cloneCompleteBundles([]CompleteBundle{expected})[0])
	s.next++
	s.completed++
	return nil
}

type checkpointCountingReader struct {
	r io.Reader
	n int64
}

func (r *checkpointCountingReader) Read(b []byte) (int, error) {
	n, e := r.r.Read(b)
	r.n += int64(n)
	return n, e
}

// Snapshot serializes a pre-Finalize checkpoint to the caller's writer. The
// caller owns compression, flushing, closing, and committing those bytes. Success
// acknowledges serialization only, not durable publication, and leaves the session
// usable. Snapshot never closes the writer. Any serialization/write failure
// invalidates this session, as does a failed SnapshotPath.
func (s *CompleteFileSession) Snapshot(output io.Writer) error {
	if output == nil {
		return s.invalidate(fmt.Errorf("checkpoint writer required"))
	}
	data, err := s.snapshotBytes()
	if err != nil {
		return s.invalidate(err)
	}
	n, err := output.Write(data)
	if err == nil && n != len(data) {
		err = io.ErrShortWrite
	}
	return s.invalidate(err)
}

// SnapshotPath is the explicit local-filesystem persistence helper. Unlike
// Snapshot, it owns atomic replacement and synchronization. A failure after the
// rename commit point returns *CheckpointDurabilityError; the replacement is
// visible but crash durability is unknown. No rollback is attempted.
func (s *CompleteFileSession) SnapshotPath(path string) error {
	data, err := s.snapshotBytes()
	if err != nil {
		return s.invalidate(err)
	}
	return s.invalidate(replaceCheckpoint(path, data))
}

func (s *CompleteFileSession) snapshotBytes() ([]byte, error) {
	if err := s.usable(); err != nil {
		return nil, err
	}
	if s.completed == 0 {
		return nil, fmt.Errorf("checkpoint requires successful complete-file boundary")
	}
	capture := ownergraph.NewRegistry()
	if err := prepareCompleteSession(s.options, capture, s.root.result.encountersState); err != nil {
		return nil, err
	}
	graph, err := capture.Capture(s.root)
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(checkpointEnvelope{Version: checkpointVersion, Compatibility: s.options.Compatibility, Bundles: s.provenance, Graph: graph})
	if err != nil {
		return nil, err
	}
	if len(data) > maxCheckpointBytes {
		return nil, fmt.Errorf("checkpoint exceeds size limit")
	}
	return data, nil
}

// Finalize is terminal and operates on this fresh restored/live graph, never a
// clone. Existing disk checkpoints remain immutable and independently resumable.
func (s *CompleteFileSession) Finalize(ctx context.Context) ([]*instances.FinalizedInstance, error) {
	if err := s.usable(); err != nil {
		return nil, s.invalidate(err)
	}
	s.finalized = true
	var result []*instances.FinalizedInstance
	for _, instance := range s.root.result.encountersState.Instances {
		v, err := instance.Finalize(ctx)
		if err != nil {
			return nil, s.invalidate(err)
		}
		result = append(result, v)
	}
	s.root.result.encountersState.Finalize()
	return result, nil
}
func RestoreCompleteFileSessionPath(path string, o CompleteSessionOptions) (*CompleteFileSession, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	return RestoreCompleteFileSession(f, o)
}

func sessionBundles(o CompleteSessionOptions) ([]CompleteBundle, error) {
	if o.Bundles != nil && o.Files != nil {
		return nil, fmt.Errorf("set Bundles or artifact-free Files, not both")
	}
	bundles := o.Bundles
	if bundles == nil {
		bundles = make([]CompleteBundle, len(o.Files))
		for i, file := range o.Files {
			bundles[i].File = file
		}
	}
	if err := validateCompleteBundles(bundles); err != nil {
		return nil, err
	}
	return cloneCompleteBundles(bundles), nil
}
