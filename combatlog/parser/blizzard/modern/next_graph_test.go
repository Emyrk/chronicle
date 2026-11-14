package modern

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
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	prepared "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func modernGraphContext(t *testing.T, format database.LogFormat, flavor database.WoWFlavor) (context.Context, snapshot.Compatibility) {
	t.Helper()
	id := snapshot.Compatibility{DatasetID: "11111111-1111-1111-1111-111111111111", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(format), Flavor: flavor.CanonicalKey()}
	return snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{Format: format, Flavor: flavor}), id), id
}
func modernGraphRegistry(t *testing.T, id snapshot.Compatibility) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterNextPipelineGraphOwner(r, id))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	require.NoError(t, prepared.RegisterPreparedSpellGraphOwner(r, id, map[chrondbc.SpellID]*chrondbc.Spell{1: {ID: 1}, 974: {ID: 974}, 379: {ID: 379}}))
	return r
}
func drainModern(t *testing.T, ctx context.Context, s *NextSource) []messages.Message {
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
func TestModernRetainedGraphFiles(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		format database.LogFormat
		flavor database.WoWFlavor
	}{
		{"v9", database.LogFormatV9Cleu, database.WoWFlavor{database.FlavorTBC}},
		{"hermes", database.LogFormatHermesproxy1142Cc, database.WoWFlavor{database.FlavorVanilla}},
		{"v22", database.LogFormatV22Cleu, database.WoWFlavor{database.FlavorWrath}},
		{"forever", database.LogFormatV22Cleu, database.WoWFlavor{database.FlavorWoWForever}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx, id := modernGraphContext(t, tc.format, tc.flavor)
			r := modernGraphRegistry(t, id)
			p, e := NewNextPipeline(ctx, nil, hermesProxyTestDB{}, nil, nil)
			require.NoError(t, e)
			_, e = r.Capture(p)
			require.Error(t, e)
			p.SetRealmClockInfo(&realmclock.Info{LocalTime: time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC), UTCTime: time.Date(2026, 9, 3, 12, 0, 0, 0, time.UTC)})
			stamp := func(second string) string {
				if tc.format == database.LogFormatHermesproxy1142Cc {
					return "9/3 12:00:" + second
				}
				return "9/3/2026 12:00:" + second + "+0"
			}
			version := 9
			if tc.format == database.LogFormatV22Cleu {
				version = 22
			}
			header := stamp("00.000") + fmt.Sprintf("  COMBAT_LOG_VERSION,%d,ADVANCED_LOG_ENABLED,0", version)
			aura := stamp("03.000") + `  SPELL_AURA_APPLIED,Player-2-00000001,"Healer-Realm",0x514,0,Player-2-00000002,"Tank-Realm",0x514,0,974,"Earth Shield",0x8,BUFF`
			damage := stamp("02.000") + `  SPELL_DAMAGE,Player-2-00000001,"Healer-Realm",0x514,0,Creature-0-1-564-1-1-1,"Boss",0,0,1,"Spell",0x1,1,1,-1,1,0,0,0,nil,nil,nil`
			prefix := header + "\n" + damage + "\n" + aura
			if version == 22 {
				prefix = header + "\n" + aura + "\n" + damage
			}
			first, e := p.OpenFile(strings.NewReader(prefix))
			require.NoError(t, e)
			_, e = r.Capture(p)
			require.Error(t, e)
			canceled, cancel := context.WithCancel(ctx)
			cancel()
			_, e = first.Advance(canceled)
			require.ErrorIs(t, e, context.Canceled)
			firstEvents := drainModern(t, ctx, first)
			require.NotEmpty(t, firstEvents)
			saved, e := r.Capture(p)
			require.NoError(t, e)
			b, e := json.Marshal(saved)
			require.NoError(t, e)
			path := filepath.Join(t.TempDir(), "modern.json")
			require.NoError(t, os.WriteFile(path, b, 0600))
			b, e = os.ReadFile(path)
			require.NoError(t, e)
			var disk ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(b, &disk))
			load := func() *NextPipeline {
				v, e := r.Restore(disk)
				require.NoError(t, e)
				fresh := v.(*NextPipeline)
				_, e = fresh.OpenFile(strings.NewReader(""))
				require.Error(t, e)
				require.NoError(t, fresh.WireGraphRuntime(ctx, nil, hermesProxyTestDB{}, nil, nil))
				return fresh
			}
			a, c := load(), load()
			require.Equal(t, p.GUIDMappings(), a.GUIDMappings())
			a.names.values[42] = "changed"
			require.NotContains(t, c.names.values, 42)
			delete(a.names.values, 42)
			heal := stamp("02.500") + `  SPELL_HEAL,Player-2-00000002,"Tank-Realm",0x514,0,Player-2-00000002,"Tank-Realm",0x514,0,379,"Earth Shield",0x8,10,10,0,0,nil`
			suffix := heal
			var expected []messages.Message
			for i, branch := range []*NextPipeline{p, a, c} {
				s, e := branch.OpenFile(strings.NewReader(suffix))
				require.NoError(t, e)
				out := drainModern(t, ctx, s)
				if i == 0 {
					expected = out
				} else {
					require.Equal(t, expected, out)
				}
				require.NotEmpty(t, out)
			}
			expectedGraph, e := r.Capture(p)
			require.NoError(t, e)
			for _, branch := range []*NextPipeline{a, c} {
				actual, e := r.Capture(branch)
				require.NoError(t, e)
				require.Equal(t, expectedGraph, actual)
			}
			// The second file's timestamp overlaps the first; a fresh reorder buffer must
			// emit it in the second file, never interleave it into the completed first.
			require.True(t, expected[0].Date().Before(firstEvents[len(firstEvents)-1].Date()))
			wrong := id
			wrong.DatasetRevision++
			_, e = modernGraphRegistry(t, wrong).Restore(disk)
			require.Error(t, e)
		})
	}
}
