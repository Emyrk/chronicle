package rankings

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func dpsStatePayload(t *testing.T, state DPSTrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func TestDPSTrackerStateAssemblyContinuationAndSharedDamage(t *testing.T) {
	t.Parallel()
	units := newTestUnits()
	player := makePlayerGUID(1)
	targetA := makeCreatureGUID(32857, 1)
	targetB := makeCreatureGUID(32867, 2)
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	units.Info[targetA] = unitinfo.Info{Guid: targetA, CanCooperate: false}
	units.Info[targetB] = unitinfo.Info{Guid: targetB, CanCooperate: false}
	encounterID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	continuous := NewDPSTracker(units, nil, DamageRuleAssemblyOfIron)
	continuous.FightStarted(encounterID, nil)
	caster := player
	damageA := &messages.Damage{Caster: &caster, Target: targetA, Amount: 100, HitType: types.HitTypeHit}
	damageB := &messages.Damage{Caster: &caster, Target: targetB, Amount: 200, HitType: types.HitTypeHit}
	require.NoError(t, continuous.ProcessMessage(true, encounterID, damageA))
	require.NoError(t, continuous.ProcessMessage(true, encounterID, damageB))

	paths := map[*messages.Damage]string{damageA: "/damage/a", damageB: "/damage/b"}
	captureCalls := 0
	state, err := continuous.CaptureState(func(damage *messages.Damage) (string, error) {
		captureCalls++
		return paths[damage], nil
	})
	require.NoError(t, err)
	require.Equal(t, 2, captureCalls, "shared references are captured once per canonical Damage")
	payload := dpsStatePayload(t, state)
	decoded, err := DecodeDPSTrackerState(DPSTrackerStateVersion, payload)
	require.NoError(t, err)
	byPath := map[string]*messages.Damage{"/damage/a": damageA, "/damage/b": damageB}
	restored, err := decoded.Restore(units, nil, func(path string) (*messages.Damage, error) { return byPath[path], nil })
	require.NoError(t, err)
	require.Same(t, damageA, restored.assemblyPending[targetA][0])
	require.Same(t, damageA, damageKey(t, restored.damageCredits, "/damage/a", paths))
	require.Equal(t, continuous.assemblyOfIron.phaseDamage, restored.assemblyOfIron.phaseDamage)

	// Ranking owns the accumulated phase totals, while classification still sees
	// the canonical mutable Damage object shared with the event buffer.
	damageB.Amount = 250
	slainA := &messages.Slain{Victim: targetA}
	require.NoError(t, continuous.ProcessMessage(true, encounterID, slainA))
	require.NoError(t, restored.ProcessMessage(true, encounterID, &messages.Slain{Victim: targetA}))
	continuous.FightEnded(encounterID, nil)
	restored.FightEnded(encounterID, nil)
	for _, tracker := range []*DPSTracker{continuous, restored} {
		tracker.ClassifyDamage(encounterID, DamageTargets{}, damageA, nil)
		tracker.ClassifyDamage(encounterID, DamageTargets{}, damageB, nil)
		tracker.FinishDamageClassification(encounterID)
	}
	require.Equal(t, int64(250), damageB.Unranked)
	require.Equal(t, continuous.results, restored.results)
	require.Equal(t, int64(100), restored.results[encounterID].Units[player].RankedDamageDone)
	require.Equal(t, int64(200), restored.results[encounterID].Units[player].UnrankedDamageDone)
	require.Equal(t, payload, dpsStatePayload(t, state))
	require.Equal(t, payload, dpsStatePayload(t, decoded))
}

func damageKey(t *testing.T, credits map[*messages.Damage]guid.GUID, path string, paths map[*messages.Damage]string) *messages.Damage {
	t.Helper()
	for damage := range credits {
		if paths[damage] == path {
			return damage
		}
	}
	t.Fatalf("missing damage credit %s", path)
	return nil
}

func TestDPSTrackerStateAssemblyExcludedReference(t *testing.T) {
	t.Parallel()
	units := newTestUnits()
	player := makePlayerGUID(1)
	targetA := makeCreatureGUID(32857, 1)
	targetB := makeCreatureGUID(32867, 2)
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	units.Info[targetA] = unitinfo.Info{Guid: targetA, CanCooperate: false}
	units.Info[targetB] = unitinfo.Info{Guid: targetB, CanCooperate: false}
	tracker := NewDPSTracker(units, nil, DamageRuleAssemblyOfIron)
	tracker.FightStarted(uuid.New(), nil)
	caster := player
	damageA := &messages.Damage{Caster: &caster, Target: targetA, Amount: 100}
	damageB := &messages.Damage{Caster: &caster, Target: targetB, Amount: 200}
	require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, damageA))
	require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, damageB))
	require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, &messages.Slain{Victim: targetA}))
	require.True(t, tracker.assemblyExcluded[damageB])

	paths := map[*messages.Damage]string{damageA: "/a", damageB: "/b"}
	state, err := tracker.CaptureState(func(damage *messages.Damage) (string, error) { return paths[damage], nil })
	require.NoError(t, err)
	decoded, err := DecodeDPSTrackerState(DPSTrackerStateVersion, dpsStatePayload(t, state))
	require.NoError(t, err)
	restored, err := decoded.Restore(units, nil, func(path string) (*messages.Damage, error) {
		if path == "/a" {
			return damageA, nil
		}
		return damageB, nil
	})
	require.NoError(t, err)
	require.True(t, restored.assemblyExcluded[damageB])
	require.Contains(t, restored.damageCredits, damageB)
	require.Empty(t, restored.assemblyPending)
}

func TestDPSTrackerStateHealingAndFormContinuation(t *testing.T) {
	t.Parallel()
	units := newTestUnits()
	healer := makePlayerGUID(1)
	target := makePlayerGUID(2)
	units.Info[healer] = unitinfo.Info{Guid: healer, IsPlayer: true, CanCooperate: true}
	units.Info[target] = unitinfo.Info{Guid: target, IsPlayer: true, CanCooperate: true}
	start := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	encounterID := uuid.MustParse("22222222-3333-4444-5555-666666666666")
	idf := identifier.NewIdentifier(map[uint32]identifier.Identity{})
	continuous := NewDPSTracker(units, idf, DamageRuleNone)
	continuous.FightStarted(encounterID, &messages.Damage{MessageBase: messages.Base(start)})
	require.NoError(t, continuous.ProcessMessage(true, encounterID, &messages.Heal{MessageBase: messages.Base(start), Caster: healer, Target: target, Amount: 100, Overheal: 20}))
	require.NoError(t, continuous.ProcessMessage(true, encounterID, &messages.Absorbed{MessageBase: messages.Base(start.Add(time.Second)), Caster: healer, Target: target, Amount: 30}))
	require.NoError(t, continuous.ProcessMessage(true, encounterID, &messages.Aura{MessageBase: messages.Base(start), Target: healer, SpellName: "Cat Form", State: types.AuraStateAdded}))
	state, err := continuous.CaptureState(nil)
	require.NoError(t, err)
	decoded, err := DecodeDPSTrackerState(DPSTrackerStateVersion, dpsStatePayload(t, state))
	require.NoError(t, err)
	restored, err := decoded.Restore(units, idf, nil)
	require.NoError(t, err)
	require.Same(t, units, restored.units)
	require.Same(t, idf, restored.identifier)

	for _, tracker := range []*DPSTracker{continuous, restored} {
		require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Heal{MessageBase: messages.Base(start.Add(10 * time.Second)), Caster: healer, Target: target, Amount: 50}))
		require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Aura{MessageBase: messages.Base(start.Add(20 * time.Second)), Target: healer, SpellName: "Cat Form", State: types.AuraStateRemoved}))
		tracker.FightEnded(encounterID, &messages.Damage{MessageBase: messages.Base(start.Add(30 * time.Second))})
		tracker.ClassifyHealing(encounterID, &encounter.RankingWindow{Start: start.Add(5 * time.Second), End: start.Add(15 * time.Second)})
	}
	require.Equal(t, continuous.results, restored.results)
	stats := restored.results[encounterID].Units[healer]
	require.Equal(t, int64(50), stats.HealingDone)
	require.Zero(t, stats.HealingAbsorbed)
	require.Equal(t, "Cat", stats.ObservedForm)
	require.Nil(t, restored.healingCredits)
}

func TestDPSTrackerStatePreservesPendingTalentAliases(t *testing.T) {
	t.Parallel()
	tracker, units := setupDPSTracker()
	player := makePlayerGUID(1)
	boss := makeCreatureGUID(100, 1)
	encounterID := uuid.MustParse("33333333-4444-5555-6666-777777777777")
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	units.Info[boss] = unitinfo.Info{Guid: boss, CanCooperate: false, Boss: true}
	units.Players[player] = combatant.Combatant{Guid: player}
	tracker.FightStarted(encounterID, nil)
	caster := player
	require.NoError(t, tracker.ProcessMessage(true, encounterID, &messages.Damage{Caster: &caster, Target: boss, Amount: 100}))
	tracker.FightEnded(encounterID, nil)
	originalStats := tracker.results[encounterID].Units[player]
	require.Same(t, originalStats, tracker.pendingTalentSnapshots[player][0])

	state, err := tracker.CaptureState(func(*messages.Damage) (string, error) { return "/damage", nil })
	require.NoError(t, err)
	payload := dpsStatePayload(t, state)
	originalStats.DamageDone = 999
	decoded, err := DecodeDPSTrackerState(DPSTrackerStateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore(units, nil, func(string) (*messages.Damage, error) { return &messages.Damage{}, nil })
	require.NoError(t, err)
	restoredStats := restored.results[encounterID].Units[player]
	require.Equal(t, int64(100), restoredStats.DamageDone)
	require.Same(t, restoredStats, restored.pendingTalentSnapshots[player][0])

	fresh := &combatant.Talents{Summary: [3]uint8{11, 9, 31}, Trees: [3][]uint8{{1, 1}, {2}, {3}}}
	units.UpdatePlayerTalents(player, fresh)
	require.NoError(t, restored.ProcessMessage(false, uuid.Nil, &messages.CombatantTalents{Guid: player}))
	require.Empty(t, restored.pendingTalentSnapshots[player])
	require.Equal(t, fresh, restoredStats.Talents)
	require.NotSame(t, fresh, restoredStats.Talents)
	fresh.Trees[0][0] = 9
	require.Equal(t, uint8(1), restoredStats.Talents.Trees[0][0])
}

func TestDPSTrackerStateRejectsCorruptionAndRestoresAtomically(t *testing.T) {
	t.Parallel()
	units := newTestUnits()
	player := makePlayerGUID(1)
	targetA := makeCreatureGUID(32857, 1)
	targetB := makeCreatureGUID(32867, 2)
	units.Info[player] = unitinfo.Info{Guid: player, IsPlayer: true, CanCooperate: true}
	units.Info[targetA] = unitinfo.Info{Guid: targetA, CanCooperate: false}
	units.Info[targetB] = unitinfo.Info{Guid: targetB, CanCooperate: false}
	tracker := NewDPSTracker(units, nil, DamageRuleAssemblyOfIron)
	tracker.FightStarted(uuid.New(), nil)
	caster := player
	damageA := &messages.Damage{Caster: &caster, Target: targetA, Amount: 100}
	damageB := &messages.Damage{Caster: &caster, Target: targetB, Amount: 200}
	require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, damageA))
	require.NoError(t, tracker.ProcessMessage(true, uuid.Nil, damageB))
	state, err := tracker.CaptureState(func(damage *messages.Damage) (string, error) {
		if damage == damageA {
			return "/a", nil
		}
		return "/b", nil
	})
	require.NoError(t, err)
	payload := dpsStatePayload(t, state)
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeDPSTrackerState(version, payload)
		require.Error(t, err)
	}
	for _, corrupt := range []string{"null", "{}", string(payload) + " {}", `{"damage_done":[]}`, `{"damage_done":[],"damage_done":[]}`} {
		_, err := DecodeDPSTrackerState(DPSTrackerStateVersion, []byte(corrupt))
		require.Error(t, err, corrupt)
	}
	var root map[string]any
	require.NoError(t, json.Unmarshal(payload, &root))
	root["pending_talent_snapshots"] = []any{map[string]any{"player": player.String(), "stats": []any{map[string]any{"encounter_id": uuid.New().String(), "unit": player.String()}}}}
	invalid, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeDPSTrackerState(DPSTrackerStateVersion, invalid)
	require.Error(t, err)

	invalidState := state
	invalidState.value.DamageDone = nil
	calls := 0
	candidate, err := invalidState.Restore(units, nil, func(string) (*messages.Damage, error) {
		calls++
		return damageA, nil
	})
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Zero(t, calls, "invalid owner state must fail before resolving references")

	candidate, err = state.Restore(units, nil, func(path string) (*messages.Damage, error) {
		calls++
		if path == "/a" {
			return damageA, nil
		}
		return nil, fmt.Errorf("missing %s", path)
	})
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Equal(t, 2, calls)
	require.Same(t, damageA, tracker.assemblyPending[targetA][0])
	require.Same(t, damageB, tracker.assemblyPending[targetB][0])
}
