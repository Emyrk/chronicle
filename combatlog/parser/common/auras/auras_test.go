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

func TestTracking_PreservesCasterAcrossProjection(t *testing.T) {
	t.Parallel()

	tr := auras.New(nil)
	caster := guid.GUID(10)
	msg := makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false)
	msg.Source = &caster
	tr.Process(msg)

	state := tr.ActiveAuras(testUnit)[testSpell.ID]
	require.NotNil(t, state)
	require.NotNil(t, state.Source)
	assert.Equal(t, caster, *state.Source)

	projected := tr.ProjectAllAuras(t0.Add(5 * time.Second))
	require.Len(t, projected, 1)
	require.NotNil(t, projected[0].Source)
	assert.Equal(t, caster, *projected[0].Source)
	assert.True(t, projected[0].IsSynthetic())
}

func TestTracking_UpdatesCasterOnlyWhenKnown(t *testing.T) {
	t.Parallel()

	tr := auras.New(nil)
	originalCaster := guid.GUID(10)
	msg := makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false)
	msg.Source = &originalCaster
	tr.Process(msg)

	unknownRefresh := makeAuraMsg(t0.Add(time.Second), testUnit, testSpell, types.AuraStateAdded, 1, false)
	tr.Process(unknownRefresh)
	state := tr.ActiveAuras(testUnit)[testSpell.ID]
	require.NotNil(t, state.Source)
	assert.Equal(t, originalCaster, *state.Source)

	newCaster := guid.GUID(20)
	knownRefresh := makeAuraMsg(t0.Add(2*time.Second), testUnit, testSpell, types.AuraStateAdded, 1, false)
	knownRefresh.Source = &newCaster
	tr.Process(knownRefresh)
	state = tr.ActiveAuras(testUnit)[testSpell.ID]
	require.NotNil(t, state.Source)
	assert.Equal(t, newCaster, *state.Source)
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

func TestProjection_WaitsForFirstRealMessage(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var projected []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { projected = append(projected, msg) })

	fightStartMsg := makeAuraMsg(t0.Add(10*time.Second), testUnit, testSpell2, types.AuraStateAdded, 1, false)
	projection.FightStarted(uuid.Nil, fightStartMsg)

	// No projection yet — still pending until first non-synthetic ProcessMessage.
	assert.Empty(t, projected, "should not project on FightStarted alone")

	// First real message triggers projection at that message's timestamp.
	realMsg := &messages.Damage{MessageBase: messages.Base(t0.Add(12 * time.Second))}
	err := projection.ProcessMessage(true, uuid.Nil, realMsg)
	require.NoError(t, err)

	require.Len(t, projected, 1)
	assert.Equal(t, t0.Add(12*time.Second), projected[0].Date(),
		"projected aura should use first real message timestamp")
	assert.True(t, projected[0].IsSynthetic())
}

func TestProjection_PullStartAuraNotDuplicated(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var projected []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { projected = append(projected, msg) })

	// FightStarted triggers pending.
	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(10 * time.Second))})

	// First real message is an aura apply for the same target+spell that's tracked.
	pullAura := makeAuraMsg(t0.Add(10*time.Second), testUnit, testSpell, types.AuraStateAdded, 1, false)
	err := projection.ProcessMessage(true, uuid.Nil, pullAura)
	require.NoError(t, err)

	// Should NOT project — the pull-starting message IS the apply for this aura.
	assert.Empty(t, projected,
		"should not project when first real message is an apply for the same aura")
}

func TestProjection_FirstRealRemovalCancelsSyntheticExpiry(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var emitted []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })
	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(5 * time.Second))})

	// The first real event removes the pre-pull aura. Projection still emits the
	// initial state immediately before that real removal, but must relinquish
	// synthetic expiry ownership for the aura.
	removal := makeAuraMsg(t0.Add(6*time.Second), testUnit, testSpell, types.AuraStateRemoved, 0, false)
	require.NoError(t, projection.ProcessMessage(true, uuid.Nil, removal))
	require.Len(t, emitted, 1, "should project the aura before its real removal")
	assert.Equal(t, types.AuraStateAdded, emitted[0].State)

	require.NoError(t, projection.ProcessMessage(true, uuid.Nil, &messages.Damage{
		MessageBase: messages.Base(t0.Add(35 * time.Second)),
	}))
	assert.Len(t, emitted, 1, "first-event removal must cancel synthetic expiry")
}

func TestProjection_SyntheticExpiryEmitted(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	// testSpell has 30s duration from t0, so MaxExistsUntil = t0+30s
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var emitted []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })

	// Start fight at t0+5s.
	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(5 * time.Second))})
	// First real message at t0+6s triggers projection.
	err := projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(6 * time.Second))})
	require.NoError(t, err)
	require.Len(t, emitted, 1, "should project one aura")

	// Next real message at t0+35s (past 30s expiry).
	err = projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(35 * time.Second))})
	require.NoError(t, err)
	require.Len(t, emitted, 2, "should emit synthetic removal")
	assert.Equal(t, types.AuraStateRemoved, emitted[1].State)
	assert.Equal(t, t0.Add(30*time.Second), emitted[1].Date(),
		"synthetic removal should be at exact expiry time")
	assert.True(t, emitted[1].IsSynthetic())
}

func TestProjection_RealEvidenceCancelsSyntheticExpiry(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var emitted []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })

	// Start fight and project.
	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(5 * time.Second))})
	err := projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(6 * time.Second))})
	require.NoError(t, err)
	require.Len(t, emitted, 1)

	// Real aura refresh at t0+15s cancels synthetic expiry.
	refresh := makeAuraMsg(t0.Add(15*time.Second), testUnit, testSpell, types.AuraStateAdded, 1, false)
	err = projection.ProcessMessage(true, uuid.Nil, refresh)
	require.NoError(t, err)

	// Later message past original expiry — no synthetic removal.
	err = projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(35 * time.Second))})
	require.NoError(t, err)
	assert.Len(t, emitted, 1, "no synthetic removal after real evidence")
}

func TestProjection_LateRealEvidenceWinsOverSyntheticExpiry(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var emitted []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })
	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(5 * time.Second))})
	require.NoError(t, projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(6 * time.Second))}))
	require.Len(t, emitted, 1)

	// Even though this refresh arrives after the prior inferred expiry, real
	// combat-log evidence is authoritative and suppresses a synthetic fade.
	refresh := makeAuraMsg(t0.Add(35*time.Second), testUnit, testSpell, types.AuraStateModified, 1, false)
	refresh.Transition = messages.AuraTransitionRefreshed
	require.NoError(t, projection.ProcessMessage(true, uuid.Nil, refresh))
	assert.Len(t, emitted, 1, "late real evidence must suppress inferred expiry")
}

func TestProjection_InCombatAuraNoSyntheticExpiry(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	// No pre-pull auras.

	var emitted []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })

	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0)})
	err := projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0)})
	require.NoError(t, err)
	assert.Empty(t, emitted, "no projections when no pre-pull auras")

	// Aura applied in combat through real message — should never get synthetic expiry.
	// (The projection doesn't track in-combat auras, only projected pre-pull ones.)
	inCombatAura := makeAuraMsg(t0.Add(5*time.Second), testUnit, testSpell, types.AuraStateAdded, 1, false)
	err = projection.ProcessMessage(true, uuid.Nil, inCombatAura)
	require.NoError(t, err)

	// Past expiry — no synthetic removal.
	err = projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(35 * time.Second))})
	require.NoError(t, err)
	assert.Empty(t, emitted, "in-combat auras should never get synthetic expiry")
}

func TestProjection_ClearsStateOnFightEnd(t *testing.T) {
	t.Parallel()
	tr := auras.New(nil)
	tr.Process(makeAuraMsg(t0, testUnit, testSpell, types.AuraStateAdded, 1, false))

	var emitted []*messages.Aura
	projection := auras.NewProjection(tr)
	projection.SetEmit(func(msg *messages.Aura) { emitted = append(emitted, msg) })

	projection.FightStarted(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(5 * time.Second))})
	err := projection.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(6 * time.Second))})
	require.NoError(t, err)
	require.Len(t, emitted, 1)

	projection.FightEnded(uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(20 * time.Second))})

	// After fight end, a later real message should not emit synthetic expiry.
	err = projection.ProcessMessage(false, uuid.Nil, &messages.Damage{MessageBase: messages.Base(t0.Add(35 * time.Second))})
	require.NoError(t, err)
	assert.Len(t, emitted, 1, "no synthetic expiry after fight end")
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
