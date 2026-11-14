package nextsource

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

// This bounded consumer retains the same mutable objects emitted to State. It
// exercises the graph contract needed by downstream pending message buffers.
type retainedConsumer struct {
	Damage *messages.Damage
	Header *messages.Versions
}

func (c *retainedConsumer) Process(m messages.Message) error {
	switch v := m.(type) {
	case *messages.Damage:
		c.Damage = v
	case *messages.Versions:
		c.Header = v
	}
	return nil
}

type sharedSourceRoot struct {
	Pipeline  *Pipeline
	Consumers *consumers.Consumers
	State     *encounters.State
	Retained  *retainedConsumer
}
type sourceFixture struct {
	recipe *encounters.GraphRecipe
	hook   *instances.HookableGraphRecipe
	id     identifier.TrustedRecipe
	ctx    context.Context
}

func newSourceFixture(t *testing.T) *sourceFixture {
	t.Helper()
	ctx := testContext(t)
	id := identifier.TrustedRecipe{ID: "boss", Factory: func() *identifier.Identifier {
		return identifier.NewIdentifier(map[uint32]identifier.Identity{100: {Name: "boss", Affiliation: types.AffiliationHostile, Boss: true}})
	}}
	hook := &instances.HookableGraphRecipe{ID: "test-zone", Name: "test zone", Format: database.LogFormat112aCcAddon, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}, Factories: characters.TrustedFactoryRecipe{ID: "common"}, MatchesZone: func(z zone.Zone) bool { return z.Name == "test zone" }}
	recipe := &encounters.GraphRecipe{ID: "test-source-consumers", DurationModifiers: &chrondbc.DurationModifierSet{}, Catalog: &chrondbc.ConsumableCatalog{}}
	recipe.Resolver = func(_ bool, z zone.Zone, u *unitdb.Units) *instances.Hookable {
		i, e := id.New()
		require.NoError(t, e)
		h, e := hook.New(ctx, slog.Default(), u, z, i)
		require.NoError(t, e)
		return h
	}
	return &sourceFixture{recipe, hook, id, ctx}
}
func (f *sourceFixture) registry(t *testing.T, capture *encounters.State) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	a := auras.GraphOptions{DurationModifiers: f.recipe.DurationModifiers, Compatibility: testIdentity().RuntimeIdentity()}
	if capture != nil {
		a.ObserverTracking = capture.Auras
	}
	for _, e := range []error{RegisterGraphOwner(r, testIdentity()), encounters.RegisterGraphOwner(r, f.recipe), zoner.RegisterGraphOwner(r), auras.RegisterGraphOwners(r, a), consumeevidence.RegisterGraphOwners(r, consumeevidence.GraphOptions{Catalog: f.recipe.Catalog, Compatibility: testIdentity().RuntimeIdentity()}), instances.RegisterHookableGraphOwner(r, f.hook), instances.RegisterOngoingFightGraphOwner(r), instances.RegisterPhaseTrackerGraphOwner(r, nil), characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: f.hook.Factories, Identifier: f.id, ValidateRuntime: instances.ValidateHookableCharactersRuntime}), period.RegisterGraphOwners(r), unitdb.RegisterGraphOwner(r), identifier.RegisterGraphOwner(r, f.id), messages.RegisterDamageGraphOwner(r), encounterevents.RegisterGraphOwners(r), rankings.RegisterEngagementGraphOwner(r), overviewmetrics.RegisterGraphOwner(r), loot.RegisterGraphOwners(r), armory.RegisterGraphOwner(r), participants.RegisterGraphOwner(r), vehicles.RegisterGraphOwner(r), raidgroups.RegisterGraphOwner(r)} {
		require.NoError(t, e)
	}
	// Prepared spell registration is supplied below by the shared leaf adapter.
	require.NoError(t, registerFixtureSpell(r))
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[retainedConsumer]{Type: "test.retainedConsumer", Version: 1, Init: func() *retainedConsumer { return new(retainedConsumer) }, Capture: func(v *retainedConsumer, c *ownergraph.Capture) ([]byte, error) {
		refs := []string{"", ""}
		var e error
		if v.Damage != nil {
			refs[0], e = c.Ref(v.Damage)
			if e != nil {
				return nil, e
			}
		}
		if v.Header != nil {
			refs[1], e = c.Ref(v.Header)
			if e != nil {
				return nil, e
			}
		}
		return json.Marshal(refs)
	}, Restore: func(v *retainedConsumer, _ uint32, b []byte, c *ownergraph.Restore) error {
		var refs []string
		if e := json.Unmarshal(b, &refs); e != nil {
			return e
		}
		var e error
		if refs[0] != "" {
			v.Damage, e = ownergraph.LoadAs[*messages.Damage](c, refs[0])
			if e != nil {
				return e
			}
		}
		if refs[1] != "" {
			v.Header, e = ownergraph.LoadAs[*messages.Versions](c, refs[1])
		}
		return e
	}}))
	require.NoError(t, consumers.RegisterGraphOwner(r, []consumers.GraphRecipe{{ID: "encounters", Validate: func(c consumers.Consumer) error {
		if _, ok := c.(*encounters.State); !ok {
			return fmt.Errorf("wrong encounter consumer")
		}
		return nil
	}}, {ID: "retained", Validate: func(c consumers.Consumer) error {
		if _, ok := c.(*retainedConsumer); !ok {
			return fmt.Errorf("wrong retained consumer")
		}
		return nil
	}}}))
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[sharedSourceRoot]{Type: "test.sourceRoot", Version: 1, Init: func() *sharedSourceRoot { return new(sharedSourceRoot) }, Capture: func(v *sharedSourceRoot, c *ownergraph.Capture) ([]byte, error) {
		refs := []string{}
		for _, o := range []any{v.Pipeline, v.Consumers, v.State, v.Retained} {
			ref, e := c.Ref(o)
			if e != nil {
				return nil, e
			}
			refs = append(refs, ref)
		}
		return json.Marshal(refs)
	}, Restore: func(v *sharedSourceRoot, _ uint32, b []byte, c *ownergraph.Restore) error {
		var refs []string
		if e := json.Unmarshal(b, &refs); e != nil {
			return e
		}
		var e error
		v.Pipeline, e = ownergraph.LoadAs[*Pipeline](c, refs[0])
		if e != nil {
			return e
		}
		v.Consumers, e = ownergraph.LoadAs[*consumers.Consumers](c, refs[1])
		if e != nil {
			return e
		}
		v.State, e = ownergraph.LoadAs[*encounters.State](c, refs[2])
		if e != nil {
			return e
		}
		v.Retained, e = ownergraph.LoadAs[*retainedConsumer](c, refs[3])
		return e
	}}))
	return r
}
func runSharedFile(t *testing.T, ctx context.Context, r *sharedSourceRoot, records string) []messages.Message {
	t.Helper()
	source, err := r.Pipeline.OpenFile(strings.NewReader(records), 1<<20)
	require.NoError(t, err)
	var all []messages.Message
	for {
		batch, err := source.Advance(ctx)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		for _, m := range batch {
			require.NoError(t, r.Consumers.Process(m))
		}
		all = append(all, batch...)
	}
	return all
}
func TestSharedPipelineConsumerGraphDiskAliases(t *testing.T) {
	t.Parallel()
	f := newSourceFixture(t)
	db := &stateDB{}
	p, err := New(f.ctx, nil, db, nil, "build")
	require.NoError(t, err)
	state, err := f.recipe.New(f.ctx, slog.Default())
	require.NoError(t, err)
	retained := new(retainedConsumer)
	root := &sharedSourceRoot{p, consumers.New(slog.Default(), state, retained), state, retained}
	prefix := "0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05\n10000|ZONE_INFO|Test Zone|1|1|raid|0|1\n10001|SPELL_DMG|0xF130000064000001|0x0000000000000001|17|100|0,0,0|0|0|2,0,0,0"
	runSharedFile(t, f.ctx, root, prefix)
	require.NotNil(t, retained.Damage)
	require.True(t, state.CurrentInstance.FightActive())
	require.Nil(t, p.activeSource)
	reg := f.registry(t, state)
	snap, err := reg.Capture(root)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "shared.json")
	require.NoError(t, os.WriteFile(path, wire, 0600))
	wire, err = os.ReadFile(path)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	// A dangling or wrong-kind synthetic damage reference must not be copied or
	// reconstructed in a private side graph.
	for _, badRef := range []string{"/missing", disk.Root} {
		var bad ownergraph.Snapshot
		require.NoError(t, json.Unmarshal(wire, &bad))
		for i := range bad.Graph.Nodes {
			n := &bad.Graph.Nodes[i]
			if n.Type != pipelineType+".shared" || len(n.Metadata) == 0 {
				continue
			}
			var env map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(n.Metadata, &env))
			var value pipelineGraphValue
			require.NoError(t, json.Unmarshal(env["data"], &value))
			payload := value.Synthetics["/root/synthetics/slain"]
			var slain map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(payload.Payload, &slain))
			var refs map[string]string
			require.NoError(t, json.Unmarshal(slain["damage"], &refs))
			for key := range refs {
				refs[key] = badRef
			}
			encoded, e := json.Marshal(refs)
			require.NoError(t, e)
			slain["damage"] = encoded
			payload.Payload, e = json.Marshal(slain)
			require.NoError(t, e)
			value.Synthetics["/root/synthetics/slain"] = payload
			env["data"], e = json.Marshal(value)
			require.NoError(t, e)
			n.Metadata, e = json.Marshal(env)
			require.NoError(t, e)
		}
		fresh := newSourceFixture(t)
		_, e := fresh.registry(t, nil).Restore(bad)
		require.Error(t, e)
	}
	restore := func() *sharedSourceRoot {
		fresh := newSourceFixture(t)
		runtimeDB := &stateDB{}
		r := fresh.registry(t, nil)
		v, e := r.Restore(disk)
		require.NoError(t, e)
		out := v.(*sharedSourceRoot)
		require.Zero(t, runtimeDB.calls)
		require.Nil(t, out.Pipeline.spells)
		require.Nil(t, out.Pipeline.activeSource)
		require.Zero(t, out.State.Auras.GraphObserverCount())
		require.Same(t, out.Retained.Header, out.State.CurrentVersions)
		_, header := out.State.CurrentInstance.GraphMetadata()
		require.Same(t, out.Retained.Header, header)
		_, e = out.Pipeline.OpenFile(bytes.NewReader(nil), 100)
		require.Error(t, e)
		require.NoError(t, out.Pipeline.WireGraphRuntime(fresh.ctx, nil, runtimeDB, nil))
		require.Zero(t, runtimeDB.calls)
		require.NoError(t, out.Consumers.WireGraphRuntime(slog.Default(), []consumers.GraphRuntime{{ID: "encounters", Preflight: func(c consumers.Consumer) error {
			return c.(*encounters.State).ValidateGraphRuntime(fresh.ctx, slog.Default())
		}, Wire: func(c consumers.Consumer) error {
			return c.(*encounters.State).WireGraphRuntime(fresh.ctx, slog.Default())
		}}, {ID: "retained", Preflight: func(consumers.Consumer) error { return nil }, Wire: func(consumers.Consumer) error { return nil }}}))
		return out
	}
	a, b := restore(), restore()
	require.NotSame(t, a.Retained.Damage, b.Retained.Damage)
	require.NotSame(t, a.Retained.Damage.SpellData, b.Retained.Damage.SpellData)
	suffix := "10002|DEATH|0xF130000064000001"
	want := runSharedFile(t, f.ctx, root, suffix)
	got := runSharedFile(t, f.ctx, a, suffix)
	again := runSharedFile(t, f.ctx, b, suffix)
	require.Equal(t, want, got)
	require.Equal(t, got, again)
	found := false
	for _, m := range got {
		if slain, ok := m.(*messages.Slain); ok {
			found = true
			require.Same(t, a.Retained.Damage, slain.Attribution)
			require.Same(t, a.Retained.Damage.SpellData, slain.Attribution.(*messages.Damage).SpellData)
		}
	}
	require.True(t, found)
}

func TestSharedPipelineGraphRequiresSuccessfulEOF(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	p, err := New(ctx, nil, &stateDB{}, nil, "build")
	require.NoError(t, err)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(r, testIdentity()))
	_, err = r.Capture(p)
	require.Error(t, err, "fresh construction is not a completed file")
	source, err := p.OpenFile(strings.NewReader("10000|DEATH|0x0000000000000001"), 1<<20)
	require.NoError(t, err)
	_, err = source.Advance(ctx)
	require.NoError(t, err)
	_, err = r.Capture(p)
	require.Error(t, err, "returning last record is not EOF")
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)
	_, err = r.Capture(p)
	require.NoError(t, err)
	require.Nil(t, p.activeSource)
	failed, err := p.OpenFile(strings.NewReader("10000|DEATH|0x0000000000000001\n1|DEATH|0x0000000000000001"), 1<<20)
	require.NoError(t, err)
	_, err = failed.Advance(ctx)
	require.NoError(t, err)
	_, err = failed.Advance(ctx)
	require.Error(t, err)
	_, _ = failed.Advance(ctx) // observing EOF after an error cannot rehabilitate capture
	_, err = r.Capture(p)
	require.Error(t, err)
	_, err = p.OpenFile(bytes.NewReader(nil), 100)
	require.Error(t, err)
}

func TestSharedPipelineGraphRejectsChangedIdentity(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	p, err := New(ctx, nil, &stateDB{}, nil, "build")
	require.NoError(t, err)
	drain(t, ctx, p, nil)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(r, testIdentity()))
	saved, err := r.Capture(p)
	require.NoError(t, err)
	wire, err := json.Marshal(saved)
	require.NoError(t, err)
	for _, kind := range []string{"identity", "decoder", "synthetic", "version"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var env map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				var v pipelineGraphValue
				require.NoError(t, json.Unmarshal(env["data"], &v))
				switch kind {
				case "identity":
					v.Compatibility.DatasetRevision++
				case "decoder":
					v.Decoder.Type = "wrong"
				case "synthetic":
					delete(v.Synthetics, "/root/synthetics/aura-owner")
				case "version":
					env["version"] = json.RawMessage(`999`)
				}
				b, e := json.Marshal(v)
				require.NoError(t, e)
				env["data"] = b
				n.Metadata, e = json.Marshal(env)
				require.NoError(t, e)
			}
			_, e := r.Restore(bad)
			require.Error(t, e)
		})
	}
}

func registerFixtureSpell(r *ownergraph.Registry) error {
	unknown := chrondbc.UnknownSpell(17)
	return next.RegisterPreparedSpellGraphOwner(r, testIdentity().RuntimeIdentity(), map[chrondbc.SpellID]*chrondbc.Spell{17: &unknown})
}

func TestSharedPipelineCanceledRetryAndRecoverableRecord(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	p, err := New(ctx, nil, &stateDB{}, nil, "build")
	require.NoError(t, err)
	source, err := p.OpenFile(strings.NewReader("malformed\n10000|DEATH|0x0000000000000001"), 1<<20)
	require.NoError(t, err)
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = source.Advance(canceled)
	require.ErrorIs(t, err, context.Canceled)
	require.False(t, p.failed)
	require.Same(t, source, p.activeSource)
	_, err = source.Advance(ctx)
	require.Error(t, err)
	require.False(t, p.failed, "ordinary malformed records remain recoverable")
	_, err = source.Advance(ctx)
	require.NoError(t, err)
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)
	require.Nil(t, p.activeSource)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(r, testIdentity()))
	_, err = r.Capture(p)
	require.NoError(t, err)
	_, err = source.Advance(ctx)
	require.ErrorContains(t, err, "no longer the active file")
}
