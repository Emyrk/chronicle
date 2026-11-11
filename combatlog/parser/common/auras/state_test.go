package auras

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type auraStateFetcher struct {
	spells map[chrondbc.SpellID]*chrondbc.Spell
	calls  int
}

func (f *auraStateFetcher) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	f.calls++
	return f.spells[id], nil
}
func auraMessage(now time.Time, id chrondbc.SpellID, spells map[chrondbc.SpellID]*chrondbc.Spell, state types.AuraState, transition messages.AuraTransition) *messages.Aura {
	source := guid.GUID(2)
	return &messages.Aura{MessageBase: messages.Base(now), Target: 1, Source: &source, SpellData: spells[id], SpellName: fmt.Sprint(id), IsBuff: true, State: state, Transition: transition, Amount: 2}
}

func TestAuraStateContinuationAndProjectionDedup(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	spells := map[chrondbc.SpellID]*chrondbc.Spell{}
	for _, id := range []chrondbc.SpellID{1, 2, 3} {
		spells[id] = &chrondbc.Spell{ID: id, Duration: chrondbc.SpellDuration{MaxDuration: 10000}, SpellClassSet: 8, SpellClassMask: 1}
	}
	mods := &chrondbc.DurationModifierSet{ByID: map[int32]chrondbc.DurationModifier{1: {SpellID: 1, Percent: 50}}, ByClassBit: map[int32]map[uint64][]int32{8: {1: {1}}}}
	for _, pending := range []bool{true, false} {
		t.Run(fmt.Sprint(pending), func(t *testing.T) {
			t.Parallel()
			tracker := New(mods)
			var notifications []Notification
			tracker.AddObserver(func(n Notification) { notifications = append(notifications, n) })
			projection := NewProjection(tracker)
			var emitted []*messages.Aura
			projection.SetEmit(func(m *messages.Aura) { emitted = append(emitted, m) })
			for id := chrondbc.SpellID(1); id <= 3; id++ {
				tracker.Process(auraMessage(now, id, spells, types.AuraStateAdded, messages.AuraTransitionApplied))
			}
			require.Equal(t, now.Add(15*time.Second), tracker.units[1][1].MaxExistsUntil)
			start := &messages.Combatant{MessageBase: messages.Base(now.Add(time.Second))}
			projection.FightStarted(uuid.Nil, start)
			if !pending {
				require.NoError(t, projection.ProcessMessage(true, uuid.Nil, start))
			}
			refs := make(map[string]*chrondbc.Spell)
			capture := func(spell *chrondbc.Spell) (string, error) {
				name := fmt.Sprint(spell.ID)
				refs[name] = spell
				return "/root/references/" + name, nil
			}
			ts, err := tracker.CaptureState(capture)
			require.NoError(t, err)
			ps, err := projection.CaptureState(capture)
			require.NoError(t, err)
			tb, err := ts.Encode()
			require.NoError(t, err)
			pb, err := ps.Encode()
			require.NoError(t, err)
			graph, values, err := next.CaptureSpellReferences(refs)
			require.NoError(t, err)
			fetcher := &auraStateFetcher{spells: spells}
			deriver, err := next.NewSpellDerivation(fetcher)
			require.NoError(t, err)
			derived, err := deriver.Restore(t.Context(), graph, values)
			require.NoError(t, err)
			require.Equal(t, 3, fetcher.calls)
			resolve := func(path string) (*chrondbc.Spell, error) { return derived[stategraph.Path(path)], nil }
			td, err := DecodeTrackingState(TrackingStateVersion, tb)
			require.NoError(t, err)
			pd, err := DecodeProjectionState(ProjectionStateVersion, pb)
			require.NoError(t, err)
			restored, err := td.Restore(mods, resolve)
			require.NoError(t, err)
			require.Empty(t, restored.observers)
			var gotNotifications []Notification
			restored.AddObserver(func(n Notification) { gotNotifications = append(gotNotifications, n) })
			var gotEmitted []*messages.Aura
			rp, err := pd.Restore(restored, func(m *messages.Aura) { gotEmitted = append(gotEmitted, m) }, resolve)
			require.NoError(t, err)
			require.Len(t, restored.observers, 2)
			require.Same(t, restored, rp.tracker)
			if pending {
				require.NotSame(t, restored.units[1][1], rp.snapshot[1][1])
				require.Same(t, restored.units[1][1].Spell, rp.snapshot[1][1].Spell)
			}
			notifications = nil
			emitted = nil
			apply := func(tr *Tracking, p *Projection) {
				refresh := auraMessage(now.Add(2*time.Second), 1, spells, types.AuraStateModified, messages.AuraTransitionRefreshed)
				tr.Process(refresh)
				require.NoError(t, p.ProcessMessage(true, uuid.Nil, refresh))
				require.Equal(t, now.Add(17*time.Second), tr.units[1][1].MaxExistsUntil)
				stack := auraMessage(now.Add(3*time.Second), 1, spells, types.AuraStateModified, messages.AuraTransitionStackChanged)
				tr.Process(stack)
				require.NoError(t, p.ProcessMessage(true, uuid.Nil, stack))
				require.Equal(t, now.Add(17*time.Second), tr.units[1][1].MaxExistsUntil)
				// Notification alone cancels expiry ownership before the instance sees removal.
				tr.Process(auraMessage(now.Add(4*time.Second), 2, spells, types.AuraStateRemoved, messages.AuraTransitionRemoved))
				require.NotContains(t, p.projectedAuras, projectedAuraKey{1, 2})
				require.NoError(t, p.ProcessMessage(true, uuid.Nil, &messages.Combatant{MessageBase: messages.Base(now.Add(16 * time.Second))}))
				tr.ExpireStale(now.Add(18 * time.Second))
			}
			apply(tracker, projection)
			apply(restored, rp)
			require.Equal(t, notifications, gotNotifications)
			require.Equal(t, emitted, gotEmitted)
			require.Equal(t, tracker.units, restored.units)
			require.Equal(t, projection.nextExpiry, rp.nextExpiry)
			require.Empty(t, restored.units)
			for _, m := range gotEmitted {
				require.NotEqual(t, chrondbc.SpellID(1), m.SpellData.ID, "first real refresh cancels duplicate projection/expiry")
			}
			// Neither continuation nor restored live mutations modify captured values.
			after, err := ts.Encode()
			require.NoError(t, err)
			require.Equal(t, tb, after)
			after, err = ps.Encode()
			require.NoError(t, err)
			require.Equal(t, pb, after)
		})
	}
}

func TestAuraStateCorruptionAndFailedRestoreDoesNotAttachObserver(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	spell := &chrondbc.Spell{ID: 1, Duration: chrondbc.SpellDuration{MaxDuration: 10000}}
	tr := New(nil)
	tr.Process(auraMessage(now, 1, map[chrondbc.SpellID]*chrondbc.Spell{1: spell}, types.AuraStateAdded, messages.AuraTransitionApplied))
	p := NewProjection(tr)
	p.SetEmit(func(*messages.Aura) {})
	m := &messages.Combatant{MessageBase: messages.Base(now.Add(time.Second))}
	p.FightStarted(uuid.Nil, m)
	require.NoError(t, p.ProcessMessage(true, uuid.Nil, m))
	capture := func(*chrondbc.Spell) (string, error) { return "/spell", nil }
	ts, err := tr.CaptureState(capture)
	require.NoError(t, err)
	tb, err := ts.Encode()
	require.NoError(t, err)
	ps, err := p.CaptureState(capture)
	require.NoError(t, err)
	pb, err := ps.Encode()
	require.NoError(t, err)
	for _, bad := range [][]byte{[]byte("null"), []byte(`{}`), bytes.Replace(tb, []byte(`"stacks":2`), []byte(`"stacks":null`), 1), bytes.Replace(tb, []byte(`"stacks":2,`), nil, 1), append(append([]byte{}, tb...), []byte(" {}")...)} {
		_, err := DecodeTrackingState(TrackingStateVersion, bad)
		require.Error(t, err)
	}
	_, err = DecodeTrackingState(TrackingStateVersion+1, tb)
	require.Error(t, err)
	for _, bad := range [][]byte{[]byte("null"), []byte(`{}`), bytes.Replace(pb, []byte(`"pending":false`), []byte(`"pending":null`), 1), bytes.Replace(pb, []byte(`"stacks":2,`), nil, 1)} {
		_, err := DecodeProjectionState(ProjectionStateVersion, bad)
		require.Error(t, err)
	}
	var v projectionValue
	require.NoError(t, json.Unmarshal(pb, &v))
	v.Projected = append(v.Projected, v.Projected[0])
	duplicate, err := json.Marshal(v)
	require.NoError(t, err)
	_, err = DecodeProjectionState(ProjectionStateVersion, duplicate)
	require.Error(t, err)
	_, err = DecodeProjectionState(ProjectionStateVersion+1, pb)
	require.Error(t, err)
	clean := New(nil)
	candidate, err := ps.Restore(clean, nil, nil)
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Empty(t, clean.observers)
	candidate, err = ps.Restore(clean, nil, func(string) (*chrondbc.Spell, error) { return nil, nil })
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Empty(t, clean.observers)
	restored, err := ts.Restore(nil, nil)
	require.Error(t, err)
	require.Nil(t, restored)
	_, err = tr.CaptureState(nil)
	require.Error(t, err)
	_, err = p.CaptureState(func(*chrondbc.Spell) (string, error) { return "", nil })
	require.Error(t, err)
}

func TestAuraStatePreservesNilAndCachedProjectionValues(t *testing.T) {
	t.Parallel()
	for _, units := range []map[guid.GUID]map[chrondbc.SpellID]*AuraState{nil, {}, {1: nil}, {1: {2: {}}}} {
		tr := New(nil)
		tr.units = units
		s, err := tr.CaptureState(nil)
		require.NoError(t, err)
		b, err := s.Encode()
		require.NoError(t, err)
		d, err := DecodeTrackingState(TrackingStateVersion, b)
		require.NoError(t, err)
		restored, err := d.Restore(nil, nil)
		require.NoError(t, err)
		require.Equal(t, units, restored.units)
	}
	tr := New(nil)
	p := NewProjection(tr)
	p.nextExpiry = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	p.projectedAuras = map[projectedAuraKey]*projectedAura{{1, 2}: {Key: projectedAuraKey{3, 4}}}
	state, err := p.CaptureState(nil)
	require.NoError(t, err)
	encoded, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeProjectionState(ProjectionStateVersion, encoded)
	require.NoError(t, err)
	restored, err := decoded.Restore(New(nil), nil, nil)
	require.NoError(t, err)
	require.Equal(t, p.projectedAuras, restored.projectedAuras)
	require.Equal(t, p.nextExpiry, restored.nextExpiry)
}

func TestAuraSnapshotIsolationAndDeathNotification(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	source := guid.GUID(7)
	original := New(nil)
	original.units[1] = map[chrondbc.SpellID]*AuraState{2: {Source: &source, Stacks: 3, SpellID: 2, MaxExistsUntil: now.Add(time.Hour)}}
	projection := NewProjection(original)
	projection.FightStarted(uuid.Nil, &messages.Combatant{MessageBase: messages.Base(now)})
	ts, err := original.CaptureState(nil)
	require.NoError(t, err)
	ps, err := projection.CaptureState(nil)
	require.NoError(t, err)
	tb, err := ts.Encode()
	require.NoError(t, err)
	pb, err := ps.Encode()
	require.NoError(t, err)
	*original.units[1][2].Source = 99
	original.units[1][2].Stacks = 99
	*projection.snapshot[1][2].Source = 88
	projection.snapshot[1][2].Stacks = 88
	restored, err := ts.Restore(nil, nil)
	require.NoError(t, err)
	rp, err := ps.Restore(restored, func(*messages.Aura) {}, nil)
	require.NoError(t, err)
	require.Equal(t, int32(3), restored.units[1][2].Stacks)
	require.Equal(t, guid.GUID(7), *rp.snapshot[1][2].Source)
	require.NoError(t, rp.ProcessMessage(true, uuid.Nil, &messages.Combatant{MessageBase: messages.Base(now)}))
	require.Len(t, rp.projectedAuras, 1)
	restored.ClearOnDeath(1, now)
	require.Empty(t, rp.projectedAuras, "restored constructor observer cancels projected expiry on canonical death")
	require.Empty(t, restored.units)
	after, err := ts.Encode()
	require.NoError(t, err)
	require.Equal(t, tb, after)
	after, err = ps.Encode()
	require.NoError(t, err)
	require.Equal(t, pb, after)
	duplicate := bytes.Replace(tb, []byte(`"stacks":3`), []byte(`"stacks":3,"stacks":3`), 1)
	_, err = DecodeTrackingState(TrackingStateVersion, duplicate)
	require.Error(t, err)
}
