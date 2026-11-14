package wotlk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	prepared "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

type retainedCLEUTestRoot struct {
	Pipeline *NextPipeline
	Damage   *messages.Damage
	Spell    *chrondbc.Spell
}

func cleuGraphRegistry(t *testing.T, id snapshot.Compatibility) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterNextPipelineGraphOwner(r, id))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	spell, _ := auraTestDB{}.Spell(t.Context(), 44614)
	require.NoError(t, prepared.RegisterPreparedSpellGraphOwner(r, id, map[chrondbc.SpellID]*chrondbc.Spell{44614: spell}))
	type refs struct {
		Pipeline string
		Damage   string
		Spell    string
	}
	require.NoError(t, ownergraph.Register(r, ownergraph.Codec[retainedCLEUTestRoot]{Type: "test.CLEURoot", Version: 1, Init: func() *retainedCLEUTestRoot { return new(retainedCLEUTestRoot) }, Capture: func(v *retainedCLEUTestRoot, c *ownergraph.Capture) ([]byte, error) {
		p, e := c.Ref(v.Pipeline)
		if e != nil {
			return nil, e
		}
		d, e := c.Ref(v.Damage)
		if e != nil {
			return nil, e
		}
		s, e := c.Ref(v.Spell)
		if e != nil {
			return nil, e
		}
		return json.Marshal(refs{p, d, s})
	}, Restore: func(v *retainedCLEUTestRoot, _ uint32, b []byte, c *ownergraph.Restore) error {
		var refs refs
		if e := json.Unmarshal(b, &refs); e != nil {
			return e
		}
		p, e := ownergraph.LoadAs[*NextPipeline](c, refs.Pipeline)
		if e != nil {
			return e
		}
		d, e := ownergraph.LoadAs[*messages.Damage](c, refs.Damage)
		if e != nil {
			return e
		}
		s, e := ownergraph.LoadAs[*chrondbc.Spell](c, refs.Spell)
		if e != nil {
			return e
		}
		*v = retainedCLEUTestRoot{p, d, s}
		return nil
	}}))
	return r
}
func cleuGraphContext(t *testing.T, format database.LogFormat, flavor database.WoWFlavor) (context.Context, snapshot.Compatibility) {
	t.Helper()
	id := snapshot.Compatibility{DatasetID: "11111111-1111-1111-1111-111111111111", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(format), Flavor: flavor.CanonicalKey()}
	return snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor}), id), id
}
func TestRetainedCLEUGraphDiskSuffix(t *testing.T) {
	t.Parallel()
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, database.LogFormat335aCcAddon} {
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			flavor := database.WoWFlavor{database.FlavorWrath}
			damageSuffix := "1000,0,20,0,0,0,nil,nil,nil"
			healSuffix := "1000,0,0,nil"
			if format == database.LogFormat243CcAddon {
				flavor = database.WoWFlavor{database.FlavorTBC}
				damageSuffix = "1000,20,0,0,0,nil,nil,nil"
				healSuffix = "1000,nil"
			}
			ctx, id := cleuGraphContext(t, format, flavor)
			r := cleuGraphRegistry(t, id)
			p, e := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
			require.NoError(t, e)
			p.SetRealmClockInfo(&realmclock.Info{LocalTime: time.Date(2026, 1, 14, 20, 0, 0, 0, time.UTC), UTCTime: time.Date(2026, 1, 14, 20, 0, 0, 0, time.UTC)})
			raid := "[1RG:" + strings.Repeat(",", messages.RaidGroupCount*messages.RaidGroupSize-1) + "]"
			prefix := fmt.Sprintf(`1/14 20:40:08.480  SPELL_CAST_FAILED,0x00000000000019CA,"Mage",0x512,0x00000000000019CA,"Mage",0x512,1,"Companion",0x1,"%s"`, raid) + "\n" + fmt.Sprintf(`1/14 20:40:08.481  SPELL_DAMAGE,0x00000000000019CA,"Mage",0x512,0xF1300023890000A9,"Target",0xa48,44614,"Frostfire Bolt",0x14,%s`, damageSuffix) + "\n" + nativeHealLine("20:40:08.482", healSuffix)
			source, e := p.OpenFile(strings.NewReader(prefix))
			require.NoError(t, e)
			var retained *messages.Damage
			for _, m := range drainNextSource(t, ctx, source) {
				if d, ok := m.(*messages.Damage); ok {
					retained = d
				}
			}
			require.NotNil(t, retained)
			require.NotNil(t, retained.SpellData)
			require.True(t, p.SawRaidGroup())
			root := &retainedCLEUTestRoot{p, retained, retained.SpellData}
			saved, e := r.Capture(root)
			require.NoError(t, e)
			b, e := json.Marshal(saved)
			require.NoError(t, e)
			path := filepath.Join(t.TempDir(), "retained.json")
			require.NoError(t, os.WriteFile(path, b, 0600))
			b, e = os.ReadFile(path)
			require.NoError(t, e)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(b, &disk))
			load := func() *retainedCLEUTestRoot {
				v, e := r.Restore(disk)
				require.NoError(t, e)
				fresh := v.(*retainedCLEUTestRoot)
				require.Same(t, fresh.Spell, fresh.Damage.SpellData)
				_, e = fresh.Pipeline.OpenFile(strings.NewReader(""))
				require.Error(t, e)
				require.NoError(t, fresh.Pipeline.WireGraphRuntime(ctx, nil, auraTestDB{}, nil, nil))
				refs := 0
				_, e = fresh.Pipeline.synthetics.(*synthetic.Synthetic).CaptureState(func(d *messages.Damage) (string, error) {
					require.Same(t, fresh.Damage, d)
					refs++
					return "damage", nil
				}, func(sp *chrondbc.Spell) (string, error) { require.Same(t, fresh.Spell, sp); return "spell", nil })
				require.NoError(t, e)
				require.Positive(t, refs)
				return fresh
			}
			a, broot := load(), load()
			require.NotSame(t, a.Damage, broot.Damage)
			require.NotSame(t, a.Spell, broot.Spell)
			a.Damage.Amount++
			require.NotEqual(t, a.Damage.Amount, broot.Damage.Amount)
			a.Damage.Amount--
			a.Spell.Duration.MaxDuration++
			require.NotEqual(t, a.Spell.Duration.MaxDuration, broot.Spell.Duration.MaxDuration)
			a.Spell.Duration.MaxDuration--
			suffix := `1/14 20:40:08.483  UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF1300023890000A9,"Target",0xa48` + "\n" + nativeHealLine("20:40:08.484", healSuffix)
			var expected []messages.Message
			for i, branch := range []*retainedCLEUTestRoot{root, a, broot} {
				src, e := branch.Pipeline.OpenFile(strings.NewReader(suffix))
				require.NoError(t, e)
				out := drainNextSource(t, ctx, src)
				if i == 0 {
					expected = out
				} else {
					require.Equal(t, expected, out)
					require.Equal(t, root.Damage, branch.Damage)
				}
				require.True(t, branch.Pipeline.SawRaidGroup())
			}
			expectedGraph, e := r.Capture(root)
			require.NoError(t, e)
			for _, branch := range []*retainedCLEUTestRoot{a, broot} {
				actual, e := r.Capture(branch)
				require.NoError(t, e)
				require.Equal(t, expectedGraph, actual)
			}
		})
	}
}

func TestRetainedCLEUGraphBoundaryAndIdentity(t *testing.T) {
	t.Parallel()
	ctx, id := cleuGraphContext(t, database.LogFormat335aCcAddon, database.WoWFlavor{database.FlavorWrath})
	r := cleuGraphRegistry(t, id)
	p, e := NewNextPipeline(ctx, nil, auraTestDB{}, nil, nil)
	require.NoError(t, e)
	_, e = r.Capture(p)
	require.Error(t, e)
	src, e := p.OpenFile(strings.NewReader(""))
	require.NoError(t, e)
	_, e = r.Capture(p)
	require.Error(t, e)
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	_, e = src.Advance(canceled)
	require.ErrorIs(t, e, context.Canceled)
	_, e = r.Capture(p)
	require.Error(t, e)
	_, e = src.Advance(ctx)
	require.ErrorIs(t, e, io.EOF)
	saved, e := r.Capture(p)
	require.NoError(t, e)
	for _, version := range []uint32{2, 0} {
		bad := saved
		bad.Graph.Nodes = append([]stategraph.Node(nil), saved.Graph.Nodes...)
		for i, n := range bad.Graph.Nodes {
			if n.Kind == "value" && n.Type == NextPipelineStateType {
				var envelope map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
				envelope["version"], e = json.Marshal(version)
				require.NoError(t, e)
				bad.Graph.Nodes[i].Metadata, e = json.Marshal(envelope)
				require.NoError(t, e)
			}
		}
		_, e = r.Restore(bad)
		require.Error(t, e)
	}
	wrong := id
	wrong.DatasetRevision++
	other := cleuGraphRegistry(t, wrong)
	_, e = other.Restore(saved)
	require.Error(t, e)
	fresh, e := r.Restore(saved)
	require.NoError(t, e)
	require.Error(t, fresh.(*NextPipeline).WireGraphRuntime(snapshot.WithCompatibility(ctx, wrong), nil, auraTestDB{}, nil, nil))
	p.synthetics = failingNextSynthetic{err: io.EOF}
	src, e = p.OpenFile(strings.NewReader(nativeDamageLine("20:40:08.481")))
	require.NoError(t, e)
	_, e = src.Advance(ctx)
	require.Error(t, e)
	_, e = r.Capture(p)
	require.Error(t, e)
}
