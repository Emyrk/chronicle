package auras

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProjectionHandleDeathCancelsUnitProjectionState(t *testing.T) {
	t.Parallel()

	t0 := time.Date(2026, time.July, 29, 12, 0, 0, 0, time.UTC)
	deadUnit := guid.GUID(1)
	otherUnit := guid.GUID(2)
	spell := &chrondbc.Spell{ID: 100, Duration: dbcmem.SpellDuration{MaxDuration: 30_000}}

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
}
