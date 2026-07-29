package auras_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	testUnit  = guid.GUID(1)
	testUnit2 = guid.GUID(2)
	testSpell = &chrondbc.Spell{
		ID:       100,
		Duration: dbcmem.SpellDuration{Duration: 30_000, MaxDuration: 30_000}, // 30s in ms
	}
	testSpell2 = &chrondbc.Spell{
		ID:       200,
		Duration: dbcmem.SpellDuration{Duration: 10_000, MaxDuration: 10_000}, // 10s in ms
	}
	t0 = time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
)

func makeAuraMsg(ts time.Time, target guid.GUID, spell *chrondbc.Spell, state types.AuraState, stacks int32, synthetic bool) *messages.Aura {
	var opts []func(*messages.MessageBase)
	if synthetic {
		opts = append(opts, messages.WithSynthetic())
	}
	return &messages.Aura{
		MessageBase: messages.Base(ts, opts...),
		Target:      target,
		SpellData:   spell,
		SpellName:   spell.Name(),
		State:       state,
		Amount:      stacks,
		IsBuff:      true,
	}
}

// collector records notifications for assertions.
type collector struct {
	notifs []auras.Notification
}

func (c *collector) observe(n auras.Notification) {
	c.notifs = append(c.notifs, n)
}

func TestTracking_AddedNotification(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	msg := makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false)
	tr.Process(msg)

	require.Len(t, c.notifs, 1)
	assert.Equal(t, auras.NotifyAdded, c.notifs[0].Type)
	assert.Equal(t, testUnit, c.notifs[0].Unit)
	assert.Equal(t, testSpell.ID, c.notifs[0].SpellID)
	assert.Equal(t, int32(1), c.notifs[0].Stacks)
	assert.True(t, tr.HasAura(testUnit, testSpell.ID))
}

func TestTracking_RefreshedNotification(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	// Add then re-add (refresh).
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	tr.Process(makeAuraMsg(t0.Add(5*time.Second), testUnit, testSpell, types.AuraStateAdded, 1, false))

	require.Len(t, c.notifs, 2)
	assert.Equal(t, auras.NotifyAdded, c.notifs[0].Type)
	assert.Equal(t, auras.NotifyRefreshed, c.notifs[1].Type)
}

func TestTracking_ExplicitRefreshResetsDuration(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	refresh := makeAuraMsg(t0.Add(20*time.Second), testUnit, testSpell, types.AuraStateModified, 1, false)
	refresh.Transition = messages.AuraTransitionRefreshed
	tr.Process(refresh)

	state := tr.ActiveAuras(testUnit)[testSpell.ID]
	require.NotNil(t, state)
	assert.Equal(t, t0.Add(50*time.Second), state.MaxExistsUntil)
	require.Len(t, c.notifs, 2)
	assert.Equal(t, auras.NotifyRefreshed, c.notifs[1].Type)
}

func TestTracking_DoseChangeKeepsAuraAndOriginalDuration(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	dose := makeAuraMsg(t0.Add(20*time.Second), testUnit, testSpell, types.AuraStateModified, 2, false)
	dose.Transition = messages.AuraTransitionStackChanged
	tr.Process(dose)

	state := tr.ActiveAuras(testUnit)[testSpell.ID]
	require.NotNil(t, state)
	assert.Equal(t, int32(2), state.Stacks)
	assert.Equal(t, t0.Add(30*time.Second), state.MaxExistsUntil)
}

func TestTracking_StackChangedNotification(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	tr.Process(makeAuraMsg(t0.Add(1*time.Second), testUnit, testSpell, types.AuraStateModified, 2, false))

	require.Len(t, c.notifs, 2)
	assert.Equal(t, auras.NotifyAdded, c.notifs[0].Type)
	assert.Equal(t, auras.NotifyStackChanged, c.notifs[1].Type)
	assert.Equal(t, int32(2), c.notifs[1].Stacks)
	assert.Equal(t, int32(2), tr.GetStacks(testUnit, testSpell.ID))
}

func TestTracking_StackOnlyDoesNotExtendDuration(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	// Stack modification at t0+5s should NOT reset expiry.
	tr.Process(makeAuraMsg(t0.Add(5*time.Second), testUnit, testSpell, types.AuraStateModified, 2, false))

	// Expire at t0+31s (just past original 30s duration).
	tr.ExpireStale(t0.Add(31 * time.Second))
	assert.False(t, tr.HasAura(testUnit, testSpell.ID), "aura should have expired at original duration")
}

func TestTracking_RemovedNotification(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	tr.Process(makeAuraMsg(t0.Add(10*time.Second), testUnit, testSpell, types.AuraStateRemoved, 0, false))

	require.Len(t, c.notifs, 2)
	assert.Equal(t, auras.NotifyRemoved, c.notifs[1].Type)
	assert.False(t, tr.HasAura(testUnit, testSpell.ID))
}

func TestTracking_ExpiredNotification(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	tr.ExpireStale(t0.Add(31 * time.Second))

	require.Len(t, c.notifs, 2)
	assert.Equal(t, auras.NotifyExpired, c.notifs[1].Type)
	assert.False(t, tr.HasAura(testUnit, testSpell.ID))
}

func TestTracking_RemovedOnDeath(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	deathTime := t0.Add(5 * time.Second)
	tr.ClearOnDeath(testUnit, deathTime)

	require.Len(t, c.notifs, 2)
	assert.Equal(t, auras.NotifyRemovedOnDeath, c.notifs[1].Type)
	assert.Equal(t, deathTime, c.notifs[1].Timestamp)
	assert.False(t, tr.HasAura(testUnit, testSpell.ID))
}

func TestTracking_DeathPersistentSurvives(t *testing.T) {
	t.Parallel()
	persistentSpell := &chrondbc.Spell{
		ID:       300,
		Duration: dbcmem.SpellDuration{Duration: 3600_000}, // 1hr
	}
	persistentSpell.Attrs.Set(chrondbc.AttrEx3_DeathPersistent)

	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	tr.Process(makeAuraMsg(t0, testUnit, persistentSpell, types.AuraStateAdded, 1, false))
	tr.ClearOnDeath(testUnit, t0.Add(5*time.Second))

	// Only the Added notification, no death removal.
	require.Len(t, c.notifs, 1)
	assert.Equal(t, auras.NotifyAdded, c.notifs[0].Type)
	assert.True(t, tr.HasAura(testUnit, persistentSpell.ID))
}

func TestTracking_IgnoresSynthetic(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	// Synthetic message should be ignored.
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, true))

	assert.Empty(t, c.notifs)
	assert.False(t, tr.HasAura(testUnit, testSpell.ID))
}

func TestTracking_IgnoresNilSpellData(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	msg := &messages.Aura{
		MessageBase: messages.Base(t0),
		Target:      testUnit,
		SpellData:   nil,
		State:       types.AuraStateAdded,
	}
	tr.Process(msg)

	assert.Empty(t, c.notifs)
}

func TestTracking_ProjectAllAuras(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 3, false))
	tr.Process(makeAuraMsg(t0, testUnit2, testSpell2, types.AuraStateAdded, 1, false))

	projTime := t0.Add(10 * time.Second)
	projected := tr.ProjectAllAuras(projTime)

	require.Len(t, projected, 2)
	for _, p := range projected {
		assert.True(t, p.IsSynthetic(), "projected aura should be synthetic")
		assert.Equal(t, projTime, p.Date(), "projected aura should use projection timestamp")
		assert.Equal(t, types.AuraStateAdded, p.State)
	}
}

func TestTracking_Finalize(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	assert.True(t, tr.HasAura(testUnit, testSpell.ID))

	tr.Finalize()
	assert.False(t, tr.HasAura(testUnit, testSpell.ID))
}

func TestTracking_CrossInstanceSharedState(t *testing.T) {
	t.Parallel()

	// Simulate parse-wide tracker shared across two "instances".
	tr := auras.New(nil)

	// Aura applied during instance 1.
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	assert.True(t, tr.HasAura(testUnit, testSpell.ID))

	// "Zone switch" to instance 2 — tracker retains state.
	assert.True(t, tr.HasAura(testUnit, testSpell.ID),
		"aura should persist across zone/instance switches")

	// Project into instance 2's fight start — should see the aura.
	projected := tr.ProjectAllAuras(t0.Add(60 * time.Second))
	require.Len(t, projected, 1)
	assert.Equal(t, testSpell.Name(), projected[0].SpellName)
}

func TestTracking_MultipleObservers(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c1 := &collector{}
	c2 := &collector{}
	tr.AddObserver(c1.observe)
	tr.AddObserver(c2.observe)

	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	assert.Len(t, c1.notifs, 1)
	assert.Len(t, c2.notifs, 1)
}

func TestTracking_UsesDatasetDurationModifiers(t *testing.T) {
	t.Parallel()
	spell := &chrondbc.Spell{
		ID:             401,
		Duration:       dbcmem.SpellDuration{MaxDuration: 10_000},
		SpellClassSet:  8,
		SpellClassMask: 1,
	}
	mods := &chrondbc.DurationModifierSet{
		ByID: map[int32]dbcmem.DurationModifier{
			1: {SpellID: 1, Name: "Extended Duration", Percent: 50},
		},
		ByClassBit: map[int32]map[uint64][]int32{8: {1: {1}}},
	}
	tr := auras.New(nil)
	tr.SetDurationModifiers(mods)
	tr.Process(makeAuraMsg(t0, testUnit, spell, types.AuraStateAdded, 1, false))

	state := tr.ActiveAuras(testUnit)[spell.ID]
	require.NotNil(t, state)
	assert.Equal(t, t0.Add(15*time.Second), state.MaxExistsUntil)
}

func TestTracking_NonFiniteDurationDoesNotExpire(t *testing.T) {
	t.Parallel()
	spell := &chrondbc.Spell{ID: 400, Duration: dbcmem.SpellDuration{MaxDuration: -1}}
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, spell, types.AuraStateAdded, 1, false))

	tr.ExpireStale(t0.Add(24 * time.Hour))
	assert.True(t, tr.HasAura(testUnit, spell.ID))
}

func TestTracking_RemoveUnknownDoesNotNotify(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	tr.Process(makeAuraMsg(t0, testUnit, testSpell2, types.AuraStateRemoved, 0, false))

	require.Len(t, c.notifs, 1)
	assert.Equal(t, auras.NotifyAdded, c.notifs[0].Type)
}

func TestProjection_UsesEncounterStart(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))
	start := t0.Add(10 * time.Second)
	var projected []*messages.Aura
	projection := auras.NewProjection(tr, func() time.Time { return start })
	projection.SetEmit(func(msg *messages.Aura) { projected = append(projected, msg) })

	projection.FightStarted(uuid.Nil, makeAuraMsg(start.Add(time.Second), testUnit, testSpell2, types.AuraStateAdded, 1, false))

	require.Len(t, projected, 1)
	assert.Equal(t, start, projected[0].Date())
}

func TestTracking_NonAuraMessageIgnored(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	c := &collector{}
	tr.AddObserver(c.observe)

	// Pass a non-Aura message.
	dmg := &messages.Damage{
		MessageBase: messages.Base(t0),
	}
	tr.Process(dmg)

	assert.Empty(t, c.notifs)
}
