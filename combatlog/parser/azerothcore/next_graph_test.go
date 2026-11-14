package azerothcore

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func acoreGraphContext(t *testing.T, flavor database.WoWFlavor) (context.Context, snapshot.Compatibility) {
	t.Helper()
	id := snapshot.Compatibility{DatasetID: "11111111-1111-1111-1111-111111111111", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(database.LogFormatAzerothcoreMod), Flavor: flavor.CanonicalKey()}
	return snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: flavor}), id), id
}
func acoreGraphRegistry(t *testing.T, id snapshot.Compatibility) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterNextPipelineGraphOwner(r, id))
	return r
}
func drainACore(t *testing.T, ctx context.Context, s *NextSource) []messages.Message {
	t.Helper()
	var out []messages.Message
	for {
		batch, e := s.Advance(ctx)
		if e == io.EOF {
			break
		}
		require.NoError(t, e)
		out = append(out, batch...)
	}
	return out
}
func TestACoreRetainedGraphFiles(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorWrath}, {database.FlavorVanilla}} {
		t.Run(flavor.CanonicalKey(), func(t *testing.T) {
			t.Parallel()
			ctx, id := acoreGraphContext(t, flavor)
			r := acoreGraphRegistry(t, id)
			p, e := NewNextPipeline(ctx, nil, auraSpellDB{}, nil)
			require.NoError(t, e)
			_, e = r.Capture(p)
			require.Error(t, e)
			prefix := `3000  CHRONICLE_HEADER,"Realm","3.3.5a",12340` + "\n" + `3000  SPELL_CAST_FAILED,0x0000000000000001,Player,0x400,0x0000000000000001,Player,0x400,1,Spell,0x1,"[3Z:Dalaran,none,0,,0,0,0,"`
			src, e := p.OpenFile(strings.NewReader(prefix))
			require.NoError(t, e)
			_, e = r.Capture(p)
			require.Error(t, e)
			canceled, cancel := context.WithCancel(ctx)
			cancel()
			_, e = src.Advance(canceled)
			require.ErrorIs(t, e, context.Canceled)
			drainACore(t, ctx, src)
			saved, e := r.Capture(p)
			require.NoError(t, e)
			b, e := json.Marshal(saved)
			require.NoError(t, e)
			path := filepath.Join(t.TempDir(), "acore.json")
			require.NoError(t, os.WriteFile(path, b, 0600))
			b, e = os.ReadFile(path)
			require.NoError(t, e)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(b, &disk))
			load := func() *NextPipeline {
				v, e := r.Restore(disk)
				require.NoError(t, e)
				fresh := v.(*NextPipeline)
				require.Nil(t, fresh.db)
				require.Nil(t, fresh.synthetics)
				_, e = fresh.OpenFile(strings.NewReader(""))
				require.Error(t, e)
				require.NoError(t, fresh.WireGraphRuntime(ctx, nil, auraSpellDB{}, nil))
				return fresh
			}
			a, c := load(), load()
			a.lastDate = a.lastDate.Add(time.Millisecond)
			require.NotEqual(t, a.lastDate, c.lastDate)
			a.lastDate = p.lastDate
			suffix := `3001  SPELL_CAST_FAILED,0x0000000000000001,Player,0x400,0x0000000000000001,Player,0x400,1,Spell,0x1,"~571,0,]"` + "\n" + `3002  SPELL_HEAL,0x0000000000000001,"Paladin",0x400,0x0000000000000002,"Attacker",0x400,20267,"Judgement of Light",0x2,61,0,0,nil`
			var expected []messages.Message
			for i, branch := range []*NextPipeline{p, a, c} {
				s, e := branch.OpenFile(strings.NewReader(suffix))
				require.NoError(t, e)
				out := drainACore(t, ctx, s)
				if i == 0 {
					expected = out
				} else {
					require.Equal(t, expected, out)
				}
				require.Len(t, out, 2)
				heal := out[1].(*messages.Heal)
				require.Equal(t, heal.Target, heal.Caster)
			}
			expectedGraph, e := r.Capture(p)
			require.NoError(t, e)
			for _, branch := range []*NextPipeline{a, c} {
				actual, e := r.Capture(branch)
				require.NoError(t, e)
				require.Equal(t, expectedGraph, actual)
			}
			wrong := id
			wrong.DatasetRevision++
			_, e = acoreGraphRegistry(t, wrong).Restore(disk)
			require.Error(t, e)
			for i, node := range disk.Graph.Nodes {
				if node.Kind != "value" || node.Type != NextPipelineStateType {
					continue
				}
				bad := disk
				bad.Graph.Nodes = append(disk.Graph.Nodes[:i:i], disk.Graph.Nodes[i:]...)
				bad.Graph.Nodes[i].Metadata = json.RawMessage(`{"version":99,"data":{}}`)
				_, e = r.Restore(bad)
				require.Error(t, e)
			}
		})
	}
}
func TestACoreRetainedFatalCannotSnapshot(t *testing.T) {
	t.Parallel()
	ctx, id := acoreGraphContext(t, database.WoWFlavor{database.FlavorWrath})
	r := acoreGraphRegistry(t, id)
	p, e := NewNextPipeline(ctx, nil, auraSpellDB{}, nil)
	require.NoError(t, e)
	s, e := p.OpenFile(&sourceErrorReader{data: "3000  CHRONICLE_LOOT_MONEY"})
	require.NoError(t, e)
	_, e = s.Advance(ctx)
	require.NoError(t, e)
	_, e = s.Advance(ctx)
	require.Error(t, e)
	first := e
	_, e = s.Advance(ctx)
	require.Equal(t, first, e)
	_, e = r.Capture(p)
	require.Error(t, e)
	_, e = p.OpenFile(strings.NewReader(""))
	require.Error(t, e)
}
