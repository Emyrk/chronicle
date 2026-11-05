package auras

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProjectionHandleDeathCancelsUnitProjectionState(t *testing.T) {
	t.Parallel()

	t0 := time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC)
	deadUnit := guid.GUID(1)
	otherUnit := guid.GUID(2)
	otherCaster := guid.GUID(3)
	spell := &chrondbc.Spell{ID: 100, Duration: chrondbc.SpellDuration{MaxDuration: 30_000}}

	tracker := New(nil)
	tracker.Process(&messages.Aura{
		MessageBase: messages.Base(t0),
		Target:      deadUnit,
		SpellData:   spell,
		SpellName:   "Test Aura",
		Amount:      1,
		State:       types.AuraStateAdded,
	})

	deadKey := projectedAuraKey{Unit: deadUnit, SpellID: spell.ID}
	otherKey := projectedAuraKey{Unit: otherUnit, SpellID: spell.ID}
	projection := NewProjection(tracker)
	projection.snapshot = map[guid.GUID]map[chrondbc.SpellID]*AuraState{
		deadUnit:  {spell.ID: {SpellID: spell.ID}},
		otherUnit: {spell.ID: {SpellID: spell.ID}},
	}
	projection.projectedAuras = map[projectedAuraKey]*projectedAura{
		deadKey: {
			Key:            deadKey,
			Spell:          spell,
			SpellName:      "Test Aura",
			Stacks:         1,
			Buff:           true,
			MaxExistsUntil: t0.Add(30 * time.Second),
		},
		otherKey: {
			Key:            otherKey,
			Source:         &otherCaster,
			Spell:          spell,
			SpellName:      "Test Aura",
			Stacks:         1,
			Buff:           true,
			MaxExistsUntil: t0.Add(30 * time.Second),
		},
	}

	var emitted []*messages.Aura
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })
	projection.handleDeath(deadUnit, t0.Add(10*time.Second))

	assert.NotContains(t, projection.snapshot, deadUnit)
	assert.Contains(t, projection.snapshot, otherUnit)
	assert.NotContains(t, projection.projectedAuras, deadKey)
	assert.Contains(t, projection.projectedAuras, otherKey)
	assert.False(t, tracker.HasAura(deadUnit, spell.ID))

	projection.emitSyntheticExpiries(&messages.Damage{MessageBase: messages.Base(t0.Add(35 * time.Second))})
	require.Len(t, emitted, 1)
	assert.Equal(t, otherUnit, emitted[0].Target)
	require.NotNil(t, emitted[0].Source)
	assert.Equal(t, otherCaster, *emitted[0].Source)
}

func TestProjectionTrackingNotificationCancelsSyntheticExpiry(t *testing.T) {
	t.Parallel()

	ts := time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC)
	unit := guid.GUID(1)
	spell := &chrondbc.Spell{ID: 100, Duration: chrondbc.SpellDuration{MaxDuration: 30_000}}
	key := projectedAuraKey{Unit: unit, SpellID: spell.ID}
	tracker := New(nil)
	projection := NewProjection(tracker)
	projection.projectedAuras = map[projectedAuraKey]*projectedAura{
		key: {Key: key, Spell: spell, MaxExistsUntil: ts.Add(30 * time.Second)},
	}

	tracker.Process(&messages.Aura{
		MessageBase: messages.Base(ts),
		Target:      unit,
		SpellData:   spell,
		State:       types.AuraStateAdded,
		Amount:      1,
	})

	assert.NotContains(t, projection.projectedAuras, key)
}

func BenchmarkProjectionProcessMessage(b *testing.B) {
	ts := time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC)
	tracker := New(nil)
	projection := NewProjection(tracker)
	projection.SetEmit(func(*messages.Aura) {})

	const projectedAuraCount = 40
	projection.projectedAuras = make(map[projectedAuraKey]*projectedAura, projectedAuraCount)
	for i := range projectedAuraCount {
		key := projectedAuraKey{Unit: guid.GUID(i + 1), SpellID: chrondbc.SpellID(i + 1)}
		projection.projectedAuras[key] = &projectedAura{
			Key:            key,
			MaxExistsUntil: ts.Add(time.Hour),
		}
		tracker.units[key.Unit] = map[chrondbc.SpellID]*AuraState{
			key.SpellID: {SpellID: key.SpellID},
		}
	}
	message := &messages.Damage{MessageBase: messages.Base(ts.Add(time.Minute))}

	b.ReportAllocs()
	b.ResetTimer()
	for range b.N {
		if err := projection.ProcessMessage(true, uuid.Nil, message); err != nil {
			b.Fatal(err)
		}
	}
}
