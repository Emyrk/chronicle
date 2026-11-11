package rankings

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"context"
	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	legacy "github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type graphSpellFetcher struct{ calls int }

func (f *graphSpellFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	f.calls++
	return &chrondbc.Spell{ID: id}, nil
}

func TestSharedDamageBufferSlainRankingRoundTrip(t *testing.T) {
	t.Parallel()
	ts := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	caster := guid.GUID(1)
	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	d := &messages.Damage{MessageBase: messages.Base(ts), Caster: &caster, Target: guid.GUID(0xF130000065000001), Amount: 100, SpellData: &chrondbc.Spell{ID: 1}}
	cacheOnly := &messages.Damage{MessageBase: messages.Base(ts), Target: 3, Amount: 7, SpellData: &chrondbc.Spell{ID: 1}}
	builder := encounterevents.NewBufferedBuilder[*messages.Damage, *chronicleproto.Damage]()
	builder.SetZero(ts)
	require.NoError(t, encounterevents.AddToBuilder(builder, d, 17, types2proto.Damage))
	slain := legacy.NewSlainDetective()
	slain.ProcessMessages([]messages.Message{d, cacheOnly})
	death := &messages.Slain{MessageBase: messages.Base(ts), Victim: d.Target}
	slain.ProcessMessage(death)
	// Slain bytes are already written, unlike Damage. Their attribution must not
	// be regenerated after classification changes the canonical Damage.
	slainBuilder := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	slainBuilder.SetZero(ts)
	require.NoError(t, encounterevents.AddToBuilder(slainBuilder, death, 18, types2proto.Slain))
	oldSlainBytes, err := slainBuilder.Finalize(id)
	require.NoError(t, err)
	preservedSlainBytes := append([]byte(nil), oldSlainBytes...)
	var owners []next.DamageOwner
	pending, err := encounterevents.CapturePendingDamage(builder, func(i int, d *messages.Damage) (string, error) {
		p := fmt.Sprintf("/root/buffers/0000/damage/%08d", i)
		owners = append(owners, next.DamageOwner{Path: stategraph.Path(p), Damage: d})
		return p, nil
	})
	require.NoError(t, err)
	refs := map[stategraph.Path]*messages.Damage{}
	slainRefs, err := slain.CaptureLastDamageReferences(func(target guid.GUID, d *messages.Damage) (string, error) {
		p := "/root/slain/" + target.String()
		refs[stategraph.Path(p)] = d
		return p, nil
	})
	require.NoError(t, err)
	refs["/root/ranking/credit"] = d
	graph, err := next.CaptureDamageGraph(owners, refs)
	require.NoError(t, err)
	// Transfer the actual graph payload through JSON, not shared in-memory DTOs.
	wire, err := json.Marshal(graph)
	require.NoError(t, err)
	var decoded next.DamageGraph
	require.NoError(t, json.Unmarshal(wire, &decoded))
	fetcher := &graphSpellFetcher{}
	restored, err := decoded.Restore(t.Context(), fetcher)
	require.NoError(t, err)
	require.Equal(t, 1, fetcher.calls)
	resolve := func(p string) (*messages.Damage, error) {
		v, ok := restored[stategraph.Path(p)]
		if !ok {
			return nil, fmt.Errorf("missing %s", p)
		}
		return v, nil
	}
	restoredBuilder, err := pending.Restore(resolve)
	require.NoError(t, err)
	restoredSlain, err := legacy.NewSlainDetectiveFromReferences(zoner.NewLocation(), slainRefs, resolve)
	require.NoError(t, err)
	attributed := &messages.Slain{MessageBase: messages.Base(ts), Victim: d.Target}
	restoredSlain.ProcessMessage(attributed)
	canonical := restored[owners[0].Path]
	require.Same(t, canonical, attributed.Attribution)
	require.Same(t, canonical, restored["/root/ranking/credit"])
	// Rebuild the real pointer-keyed ranking index. Other tracker state is supplied
	// explicitly here; this is not a codec for the full tracker or its results.
	makeTracker := func(message *messages.Damage) *DPSTracker {
		return &DPSTracker{damageCredits: map[*messages.Damage]guid.GUID{message: caster}, results: map[uuid.UUID]*DPSResult{id: {Units: map[guid.GUID]*UnitCombatStats{caster: {RankedDamageDone: 100}}}}}
	}
	continuousTracker, resumedTracker := makeTracker(d), makeTracker(restored["/root/ranking/credit"])
	rule := DamageTargets{Mode: DamageTargetsEntries, EntryIDs: []uint32{999}}
	require.NoError(t, builder.SerializeBuffered(func(m *messages.Damage) { continuousTracker.ClassifyDamage(id, rule, m, nil) }))
	require.NoError(t, restoredBuilder.SerializeBuffered(func(m *messages.Damage) {
		require.Contains(t, resumedTracker.damageCredits, m)
		resumedTracker.ClassifyDamage(id, rule, m, nil)
	}))
	require.Equal(t, int64(100), attributed.Attribution.(*messages.Damage).Unranked)
	require.Equal(t, continuousTracker.results, resumedTracker.results)
	want, err := builder.Finalize(id)
	require.NoError(t, err)
	got, err := restoredBuilder.Finalize(id)
	require.NoError(t, err)
	require.Equal(t, want, got)
	require.Equal(t, preservedSlainBytes, oldSlainBytes)
	otherDeath := &messages.Slain{Victim: 3}
	restoredSlain.ProcessMessage(otherDeath)
	require.Equal(t, int32(7), otherDeath.Attribution.(*messages.Damage).Amount)
	// A missing canonical target rejects the entire candidate, not a partial map.
	for i := range decoded.Graph.Nodes {
		if decoded.Graph.Nodes[i].Kind == stategraph.KindReference {
			decoded.Graph.Nodes[i].Target = "/root/missing"
			break
		}
	}
	rejected, err := decoded.Restore(t.Context(), fetcher)
	require.Error(t, err)
	require.Nil(t, rejected)
}
