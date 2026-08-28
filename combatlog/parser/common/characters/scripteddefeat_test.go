package characters

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

func TestScriptedDefeatDetectorDamageSignals(t *testing.T) {
	t.Parallel()

	boss := guid.GUID(10)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	config := ScriptedDefeatConfig{PositiveOverkill: true, Evade: true}

	for _, test := range []struct {
		name   string
		damage *messages.Damage
		want   ScriptedDefeatSignal
		ok     bool
	}{
		{
			name: "positive overkill",
			damage: &messages.Damage{
				MessageBase: messages.Base(start), Caster: &player, Target: boss,
				Amount: 100, Overkill: 1, HitType: types.HitTypeHit,
			},
			want: ScriptedDefeatPositiveOverkill,
			ok:   true,
		},
		{
			name: "wrong target",
			damage: &messages.Damage{
				MessageBase: messages.Base(start), Caster: &player, Target: guid.GUID(11),
				Overkill: 1, HitType: types.HitTypeHit,
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			detector := NewScriptedDefeatDetector(boss, config)
			got, ok := detector.Observe(test.damage, true)
			require.Equal(t, test.ok, ok)
			require.Equal(t, test.want, got)
		})
	}
}

func TestScriptedDefeatDetectorConfirmsEvadeAfterDelay(t *testing.T) {
	t.Parallel()

	boss := guid.GUID(10)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	detector := NewScriptedDefeatDetector(boss, ScriptedDefeatConfig{Evade: true})

	signal, defeated := detector.Observe(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      boss,
		HitType:     types.HitTypeEvade,
	}, true)
	require.False(t, defeated)
	require.Empty(t, signal)

	_, defeated = detector.Observe(messages.TimedOut(start.Add(ScriptedDefeatEvadeConfirmationWindow-time.Millisecond)), true)
	require.False(t, defeated)

	signal, defeated = detector.Observe(messages.TimedOut(start.Add(ScriptedDefeatEvadeConfirmationWindow)), true)
	require.True(t, defeated)
	require.Equal(t, ScriptedDefeatEvade, signal)
}

func TestScriptedDefeatDetectorCancelsEvadeOnFullyAbsorbedDamage(t *testing.T) {
	t.Parallel()

	boss := guid.GUID(10)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	detector := NewScriptedDefeatDetector(boss, ScriptedDefeatConfig{Evade: true})

	_, defeated := detector.Observe(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      boss,
		HitType:     types.HitTypeEvade,
	}, true)
	require.False(t, defeated)

	_, defeated = detector.Observe(&messages.Damage{
		MessageBase: messages.Base(start.Add(ScriptedDefeatEvadeConfirmationWindow - time.Millisecond)),
		Caster:      &player,
		Target:      boss,
		HitType:     types.HitTypeFullAbsorb,
	}, true)
	require.False(t, defeated)

	_, defeated = detector.Observe(messages.TimedOut(start.Add(time.Second)), true)
	require.False(t, defeated)
}

func TestScriptedDefeatDetectorCancelsEvadeWhenBossResumesAttacking(t *testing.T) {
	t.Parallel()

	boss := guid.GUID(10)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	detector := NewScriptedDefeatDetector(boss, ScriptedDefeatConfig{
		Evade:                   true,
		EvadeConfirmationWindow: 5 * time.Second,
	})

	_, defeated := detector.Observe(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      boss,
		HitType:     types.HitTypeEvade,
	}, true)
	require.False(t, defeated)

	_, defeated = detector.Observe(messages.TimedOut(start.Add(time.Second)), true)
	require.False(t, defeated)

	_, defeated = detector.Observe(&messages.Damage{
		MessageBase: messages.Base(start.Add(3 * time.Second)),
		Caster:      &boss,
		Target:      player,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}, true)
	require.False(t, defeated)

	_, defeated = detector.Observe(messages.TimedOut(start.Add(10*time.Second)), true)
	require.False(t, defeated)
}

func TestScriptedDefeatDetectorAuraCleanup(t *testing.T) {
	t.Parallel()

	boss := guid.GUID(10)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	detector := NewScriptedDefeatDetector(boss, ScriptedDefeatConfig{
		AuraCleanup: AuraCleanupDefeatConfig{
			DistinctAuras: 3,
			BurstWindow:   100 * time.Millisecond,
			DamageWindow:  500 * time.Millisecond,
		},
	})

	_, defeated := detector.Observe(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      boss,
		Amount:      1,
		HitType:     types.HitTypeHit,
	}, true)
	require.False(t, defeated)

	for i := range 3 {
		signal, ok := detector.Observe(&messages.Aura{
			MessageBase: messages.Base(start.Add(50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      boss,
			SpellName:   fmt.Sprintf("Debuff %d", i),
			State:       types.AuraStateRemoved,
		}, true)
		if i < 2 {
			require.False(t, ok)
			continue
		}
		require.True(t, ok)
		require.Equal(t, ScriptedDefeatAuraCleanup, signal)
	}
}

func TestScriptedDefeatDetectorAuraCleanupGuards(t *testing.T) {
	t.Parallel()

	boss := guid.GUID(10)
	player := guid.GUID(1)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	config := ScriptedDefeatConfig{
		AuraCleanup: AuraCleanupDefeatConfig{
			DistinctAuras: 3,
			BurstWindow:   100 * time.Millisecond,
			DamageWindow:  500 * time.Millisecond,
		},
	}

	for _, test := range []struct {
		name      string
		firstAura time.Duration
		auraStep  time.Duration
		active    bool
	}{
		{name: "cleanup too late", firstAura: 501 * time.Millisecond, auraStep: time.Millisecond, active: true},
		{name: "cleanup too slow", firstAura: 50 * time.Millisecond, auraStep: 60 * time.Millisecond, active: true},
		{name: "inactive character", firstAura: 50 * time.Millisecond, auraStep: time.Millisecond, active: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			detector := NewScriptedDefeatDetector(boss, config)
			_, _ = detector.Observe(&messages.Damage{
				MessageBase: messages.Base(start), Caster: &player, Target: boss,
				Amount: 1, HitType: types.HitTypeHit,
			}, true)

			for i := range 3 {
				_, defeated := detector.Observe(&messages.Aura{
					MessageBase: messages.Base(start.Add(test.firstAura + time.Duration(i)*test.auraStep)),
					Target:      boss,
					SpellName:   fmt.Sprintf("Debuff %d", i),
					State:       types.AuraStateRemoved,
				}, test.active)
				require.False(t, defeated)
			}
		})
	}
}
