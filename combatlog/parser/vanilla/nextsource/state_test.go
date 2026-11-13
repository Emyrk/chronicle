package nextsource

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/gamedataoverrides"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type stateDB struct {
	gamedb.GameDB
	calls int
}

func (d *stateDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	d.calls++
	return nil, chrondbc.SpellNotFound(id)
}
func (d *stateDB) ExtraAttackSpell(context.Context, int32) (chrondbc.ExtraAttackSpell, bool) {
	d.calls++
	return chrondbc.ExtraAttackSpell{}, false
}
func testIdentity() Compatibility {
	return Compatibility{DatasetID: "9c716540-587a-4bf3-bd90-739c01a6ce31", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: database.LogFormat112aCcAddon, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}.CanonicalKey(), BuildVersion: "build", CustomOverrideVersion: "test-overrides-v1"}
}
func testContext(t *testing.T) context.Context {
	return snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{DatasetID: uuid.MustParse(testIdentity().DatasetID), Format: database.LogFormat112aCcAddon, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}}), testIdentity().RuntimeIdentity())
}
func drain(t *testing.T, ctx context.Context, p *Pipeline, data []byte) []messages.Message {
	t.Helper()
	source, err := p.OpenFile(bytes.NewReader(data), 4<<20)
	require.NoError(t, err)
	var all []messages.Message
	for {
		batch, err := source.Advance(ctx)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		all = append(all, batch...)
	}
	return all
}
func stateWire(t *testing.T, s State) []byte {
	t.Helper()
	b, err := s.Encode()
	require.NoError(t, err)
	return b
}
func TestPipelineStateSplit(t *testing.T) {
	t.Parallel()
	lines := []string{
		"0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05",
		"10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;1001853:0:0:0:0|||",
		"10000|COMBATANT_TRANSMOG|Player|1:33440:61053",
		"10000|AURA_CAST|17|0x0000000000000001|0x0000000000000002|6|69|0|127|30000|0",
		"10050|BUFF_ADD|0x0000000000000002|0|17|1|1|0|0",
		"10051|SPELL_DMG|0x0000000000000002|0x0000000000000001|17|100|50,0,0|0|0|2,0,0,0",
		"10052|DEATH|0x0000000000000002",
		"10053|DEATH|0xF130003EBD01598C",
		"10054|SPELL_DMG|0xF1300041A327A7DB|0x0000000000000001|17|20000|0,0,0|0|0|2,0,0,0",
		"10055|RAID_COMPOSITION|roster|1|1,1,1,0",
	}
	for split := 0; split <= len(lines); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			ctx := testContext(t)
			db := &stateDB{}
			p, err := New(ctx, nil, db, nil, "build")
			require.NoError(t, err)
			prefix := drain(t, ctx, p, []byte(strings.Join(lines[:split], "\n")))
			var owners []next.DamageOwner
			for _, m := range prefix {
				if d, ok := m.(*messages.Damage); ok {
					owners = append(owners, next.DamageOwner{Path: stategraph.Path(fmt.Sprintf("/root/external/%08d", len(owners))), Damage: d})
				}
			}
			captured, err := p.CaptureState(testIdentity(), owners)
			require.NoError(t, err)
			wire := stateWire(t, captured)
			decoded, err := DecodeState(wire)
			require.NoError(t, err)
			injected := &stateDB{}
			restored, objects, err := RestoreState(ctx, nil, injected, nil, testIdentity(), decoded)
			require.NoError(t, err)
			require.Same(t, injected, restored.spells)
			suffix := []byte(strings.Join(lines[split:], "\n"))
			want := drain(t, ctx, p, suffix)
			got := drain(t, ctx, restored, suffix)
			require.Equal(t, want, got)
			if split == 6 {
				for _, m := range got {
					if slain, ok := m.(*messages.Slain); ok && slain.Victim == 2 {
						require.Same(t, objects[owners[0].Path], slain.Attribution)
					}
				}
			}
			a, err := p.CaptureState(testIdentity(), nil)
			require.NoError(t, err)
			b, err := restored.CaptureState(testIdentity(), nil)
			require.NoError(t, err)
			require.JSONEq(t, string(stateWire(t, a)), string(stateWire(t, b)))
			require.Equal(t, wire, stateWire(t, captured))
		})
	}
}
func TestPipelineStateRejectsBoundaryAndMismatch(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	db := &stateDB{}
	p, err := New(ctx, nil, db, nil, "build")
	require.NoError(t, err)
	source, err := p.OpenFile(strings.NewReader("10000|COMBAT_END"), 1000)
	require.NoError(t, err)
	_, err = p.CaptureState(testIdentity(), nil)
	require.Error(t, err)
	_, err = source.Advance(ctx)
	require.NoError(t, err)
	_, err = p.CaptureState(testIdentity(), nil)
	require.Error(t, err)
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)
	s, err := p.CaptureState(testIdentity(), nil)
	require.NoError(t, err)
	wrong := testIdentity()
	wrong.DatasetRevision++
	_, err = p.CaptureState(wrong, nil)
	require.Error(t, err)
	candidate, objects, err := RestoreState(ctx, nil, db, nil, wrong, s)
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Nil(t, objects)
	original := stateWire(t, s)
	for _, mutate := range []func(*State){func(s *State) { s.Version++ }, func(s *State) { delete(s.Values, "/root/decoder") }, func(s *State) {
		v := s.Values["/root/decoder"]
		v.Payload = json.RawMessage(`{}`)
		s.Values["/root/decoder"] = v
	}, func(s *State) { s.Values["/root/extra"] = s.Values["/root/source"] }} {
		var corrupt State
		require.NoError(t, json.Unmarshal(original, &corrupt))
		mutate(&corrupt)
		candidate, _, err := RestoreState(ctx, nil, db, nil, testIdentity(), corrupt)
		require.Error(t, err)
		require.Nil(t, candidate)
	}
}

// Run only with an explicitly provided local fixture root. This is a message
// source check: no DB writes, finalization, publication or external credentials.
func TestPipelineStateCapybaraLocal(t *testing.T) {
	root := os.Getenv("CHRONICLE_PIPELINE_CAPYBARA")
	if root == "" {
		t.Skip("set CHRONICLE_PIPELINE_CAPYBARA to local Capybara case")
	}
	// The explicit opt-in corpus is relatively large; keep a single run serial.
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat112aCcAddon, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol}})
	db, err := gamedb.New(ctx, gamedb.Options{SpellsDBCPath: filepath.Join(root, "dbc/Spell.dbc")})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })
	effective := localEffectiveDB{GameDB: db, flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol}}
	treesBytes, err := os.ReadFile(filepath.Join(root, "dbc/talent-trees.json"))
	require.NoError(t, err)
	var trees talents.TalentTreeData
	require.NoError(t, json.Unmarshal(treesBytes, &trees))
	ctx = parsectx.With(ctx, parsectx.Context{Format: database.LogFormat112aCcAddon, Flavor: effective.flavor, TalentTrees: &trees})
	file, err := os.Open(filepath.Join(root, "objects/raidlogs/logs/920e729c-6382-4021-afa0-293bf49ff871"))
	require.NoError(t, err)
	defer func() { require.NoError(t, file.Close()) }()
	z, err := gzip.NewReader(file)
	require.NoError(t, err)
	data, err := io.ReadAll(z)
	require.NoError(t, err)
	require.NoError(t, z.Close())
	split := len(data) / 2
	for split < len(data) && data[split] != '\n' {
		split++
	}
	split++
	identity := testIdentity()
	identity.Flavor = effective.flavor.CanonicalKey()
	ctx = snapshot.WithCompatibility(ctx, identity.RuntimeIdentity())
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	continuous, err := New(ctx, logger, effective, nil, "build")
	require.NoError(t, err)
	prefix, err := continuous.OpenFile(bytes.NewReader(data[:split]), 4<<20)
	require.NoError(t, err)
	for {
		_, err := prefix.Advance(ctx)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
	}
	state, err := continuous.CaptureState(identity, nil)
	require.NoError(t, err)
	encoded := stateWire(t, state)
	decoded, err := DecodeState(encoded)
	require.NoError(t, err)
	resumed, _, err := RestoreState(ctx, logger, effective, nil, identity, decoded)
	require.NoError(t, err)
	a, err := continuous.OpenFile(bytes.NewReader(data[split:]), 4<<20)
	require.NoError(t, err)
	b, err := resumed.OpenFile(bytes.NewReader(data[split:]), 4<<20)
	require.NoError(t, err)
	count := 0
	for {
		want, we := a.Advance(ctx)
		got, ge := b.Advance(ctx)
		require.Equal(t, we, ge)
		if we == io.EOF {
			break
		}
		require.NoError(t, we)
		require.Equal(t, want, got)
		count += len(got)
	}
	finalA, err := continuous.CaptureState(identity, nil)
	require.NoError(t, err)
	finalB, err := resumed.CaptureState(identity, nil)
	require.NoError(t, err)
	require.JSONEq(t, string(stateWire(t, finalA)), string(stateWire(t, finalB)))
	t.Logf("Capybara suffix messages=%d snapshot bytes=%d", count, len(encoded))
}

type localEffectiveDB struct {
	gamedb.GameDB
	flavor database.WoWFlavor
}

func (d localEffectiveDB) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	s, err := d.GameDB.Spell(ctx, id)
	if err != nil {
		return nil, err
	}
	copy := *s
	gamedataoverrides.ApplySpell(d.flavor, &copy)
	return &copy, nil
}

func TestPipelineStateDecodeRejectsMalformed(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	p, err := New(ctx, nil, &stateDB{}, nil, "build")
	require.NoError(t, err)
	s, err := p.CaptureState(testIdentity(), nil)
	require.NoError(t, err)
	b := stateWire(t, s)
	_, err = DecodeState(b)
	require.NoError(t, err)
	for _, bad := range []string{"null", "{}", string(b) + " {}", strings.Replace(string(b), `"version":2`, `"unexpected":true,"version":2`, 1)} {
		_, err := DecodeState([]byte(bad))
		require.Error(t, err)
	}
}

func TestPipelineStateTrustedBuildCompatibility(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	db := &stateDB{}
	p, err := New(ctx, nil, db, nil, "build")
	require.NoError(t, err)
	wrong := testIdentity()
	wrong.BuildVersion = "other-build"
	_, err = p.CaptureState(wrong, nil)
	require.Error(t, err)
	drain(t, ctx, p, []byte("10051|SPELL_DMG|0x0000000000000002|0x0000000000000001|17|100|50,0,0|0|0|2,0,0,0"))
	state, err := p.CaptureState(testIdentity(), nil)
	require.NoError(t, err)
	wire := stateWire(t, state)
	for _, mutate := range []func(*State){
		func(s *State) {
			v := s.Values["/root/source"]
			var source pipelineValue
			require.NoError(t, json.Unmarshal(v.Payload, &source))
			source.BuildVersion = "forged"
			var err error
			v.Payload, err = json.Marshal(source)
			require.NoError(t, err)
			s.Values["/root/source"] = v
		},
		func(s *State) { s.Compatibility.BuildVersion = "forged" },
		func(s *State) { s.Compatibility.BuildIdentity = "sha256:" + strings.Repeat("b", 64) },
	} {
		var forged State
		require.NoError(t, json.Unmarshal(wire, &forged))
		mutate(&forged)
		spy := &stateDB{}
		candidate, objects, err := RestoreState(ctx, nil, spy, nil, testIdentity(), forged)
		require.Error(t, err)
		require.Nil(t, candidate)
		require.Nil(t, objects)
		require.Zero(t, spy.calls)
	}
	// The build string is not the implementation identity. A distinct trusted
	// executable identity remains required, and the empty display string is supported.
	p, err = New(ctx, nil, db, nil, "")
	require.NoError(t, err)
	identity := testIdentity()
	identity.BuildVersion = ""
	state, err = p.CaptureState(identity, nil)
	require.NoError(t, err)
	restored, _, err := RestoreState(ctx, nil, db, nil, identity, state)
	require.NoError(t, err)
	require.Empty(t, restored.buildVersion)
}

func TestCompatibilityFormatPayloadUnchanged(t *testing.T) {
	t.Parallel()
	// Format remains a canonical string even though strict identity invalidates v1.
	var compatibility Compatibility
	require.NoError(t, json.Unmarshal([]byte(`{"format":"1.12a-cc-addon"}`), &compatibility))
	require.Equal(t, database.LogFormat112aCcAddon, compatibility.Format)
	encoded, err := json.Marshal(compatibility)
	require.NoError(t, err)
	var fields map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(encoded, &fields))
	require.Equal(t, `"1.12a-cc-addon"`, string(fields["format"]))
	require.Equal(t, uint32(2), StateVersion)
}

func TestStrictCompatibilityRejectsBeforeDependencies(t *testing.T) {
	t.Parallel()
	ctx := testContext(t)
	p, err := New(ctx, nil, &stateDB{}, nil, "build")
	require.NoError(t, err)
	state, err := p.CaptureState(testIdentity(), nil)
	require.NoError(t, err)
	for _, change := range []func(*Compatibility){
		func(c *Compatibility) { c.DatasetID = "9c716540-587a-4bf3-bd90-739c01a6ce32" },
		func(c *Compatibility) { c.DatasetRevision++ },
		func(c *Compatibility) { c.DatasetRevision = 0 },
		func(c *Compatibility) { c.BuildIdentity = "sha256:" + strings.Repeat("b", 64) },
		func(c *Compatibility) { c.BuildIdentity = "unknown" },
		func(c *Compatibility) { c.Format = database.LogFormat335aCcAddon },
		func(c *Compatibility) { c.Flavor = "wrath" },
	} {
		wrong := testIdentity()
		change(&wrong)
		// Even a forged matching expected/payload pair cannot override construction.
		forged := state
		forged.Compatibility = wrong
		spy := &stateDB{}
		candidate, objects, err := RestoreState(ctx, nil, spy, nil, wrong, forged)
		require.Error(t, err)
		require.Nil(t, candidate)
		require.Nil(t, objects)
		require.Zero(t, spy.calls)
		_, err = p.CaptureState(wrong, nil)
		require.Error(t, err)
	}
	// Missing construction binding may parse normally, but cannot snapshot.
	unbound := parsectx.With(t.Context(), parsectx.Context{Format: testIdentity().Format, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}})
	p, err = New(unbound, nil, &stateDB{}, nil, "build")
	require.NoError(t, err)
	_, err = p.CaptureState(testIdentity(), nil)
	require.Error(t, err)
	spy := &stateDB{}
	_, _, err = RestoreState(unbound, nil, spy, nil, testIdentity(), state)
	require.Error(t, err)
	require.Zero(t, spy.calls)
	// Context dataset disagreement fails before constructor dependencies initialize.
	mismatch := parsectx.With(t.Context(), parsectx.Context{DatasetID: uuid.MustParse("9c716540-587a-4bf3-bd90-739c01a6ce32"), Format: testIdentity().Format, Flavor: database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}})
	mismatch = snapshot.WithCompatibility(mismatch, testIdentity().RuntimeIdentity())
	_, err = New(mismatch, nil, nil, nil, "build")
	require.ErrorContains(t, err, "construction dataset")
	_, _, err = RestoreState(mismatch, nil, nil, nil, testIdentity(), state)
	require.ErrorContains(t, err, "construction dataset")
	// Version 1 has no strict revision/executable contract and is invalidated.
	state.Version = 1
	_, _, err = RestoreState(ctx, nil, nil, nil, testIdentity(), state)
	require.Error(t, err)
}
