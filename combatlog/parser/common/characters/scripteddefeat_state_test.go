package characters

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestScriptedDefeatStateContinuation(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	calls := 0
	callback := func() bool { calls++; return false }
	original := &ScriptedDefeatDetector{id: 1, config: ScriptedDefeatConfig{Evade: true, AuraCleanup: AuraCleanupDefeatConfig{NoKnownParticipantsAlive: callback}}, active: true, pendingEvade: at, lastIncomingDamage: at.Add(-time.Second), cleanupBurstStart: at, cleanupAuras: map[string]struct{}{"id:1": {}}}
	state, e := original.CaptureState()
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeScriptedDefeatDetectorState(ScriptedDefeatDetectorStateVersion, data)
	require.NoError(t, e)
	restored := new(ScriptedDefeatDetector)
	require.NoError(t, restored.RestoreState(state, callback))
	require.Zero(t, calls)
	before, _ := restored.CaptureState()
	require.Error(t, restored.RestoreState(state, nil))
	after, _ := restored.CaptureState()
	require.Equal(t, before, after)
	restored.cleanupAuras["id:2"] = struct{}{}
	require.Len(t, original.cleanupAuras, 1)
	require.Len(t, state.value.CleanupAuras, 1)
	for _, delta := range []time.Duration{ScriptedDefeatEvadeConfirmationWindow - time.Nanosecond, ScriptedDefeatEvadeConfirmationWindow} {
		signal, defeat := original.Observe(messages.TimedOut(at.Add(delta)), true)
		actual, actualDefeat := restored.Observe(messages.TimedOut(at.Add(delta)), true)
		require.Equal(t, signal, actual)
		require.Equal(t, defeat, actualDefeat)
	}
	require.False(t, restored.active)
	require.True(t, restored.pendingEvade.IsZero())
	require.Zero(t, calls)
}

type statePhaseProvider struct{ calls int }

func (p *statePhaseProvider) PhaseDefinitions() *phases.EncounterPhases { p.calls++; return nil }
func TestReferenceWrappersRestoreWithoutBehavior(t *testing.T) {
	t.Parallel()
	ch := &NeverActive{}
	detector := new(ScriptedDefeatDetector)
	original := &scriptedDefeatCharacter{Character: ch, defeat: detector}
	state, e := original.CaptureState(func(Character) (string, error) { return "character", nil }, func(*ScriptedDefeatDetector) (string, error) { return "detector", nil })
	require.NoError(t, e)
	payload, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeScriptedDefeatCharacterState(ScriptedDefeatCharacterStateVersion, payload)
	require.NoError(t, e)
	restored := InitScriptedDefeatCharacter()
	resolve := func(string) (Character, error) { return ch, nil }
	require.NoError(t, restored.RestoreState(state, resolve, func(string) (*ScriptedDefeatDetector, error) { return detector, nil }))
	require.Same(t, ch, restored.Character)
	require.Same(t, detector, restored.defeat)
	require.Error(t, restored.RestoreState(state, resolve, func(string) (*ScriptedDefeatDetector, error) { return nil, nil }))
	require.Same(t, detector, restored.defeat)
	provider := new(statePhaseProvider)
	phase := &phaseProviderCharacter{Character: restored, provider: provider}
	ps, e := phase.CaptureState(func(Character) (string, error) { return "wrapped", nil }, func(phases.PhaseProvider) (string, error) { return "provider", nil })
	require.NoError(t, e)
	data, e := ps.Encode()
	require.NoError(t, e)
	ps, e = DecodePhaseProviderCharacterState(PhaseProviderCharacterStateVersion, data)
	require.NoError(t, e)
	candidate := InitPhaseProviderCharacter()
	require.NoError(t, candidate.RestoreState(ps, func(string) (Character, error) { return restored, nil }, func(string) (phases.PhaseProvider, error) { return provider, nil }))
	require.Same(t, provider, candidate.provider)
	require.Same(t, restored, candidate.Character)
	require.Zero(t, provider.calls)
	require.Error(t, candidate.RestoreState(ps, resolve, func(string) (phases.PhaseProvider, error) { return (*statePhaseProvider)(nil), nil }))
	require.Same(t, restored, candidate.Character)
	candidate.PhaseDefinitions()
	require.Equal(t, 1, provider.calls)
}

func TestScriptedDefeatStateRejectsNilAuraSet(t *testing.T) {
	t.Parallel()
	_, err := new(ScriptedDefeatDetector).CaptureState()
	require.Error(t, err)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	original := NewScriptedDefeatDetector(1, ScriptedDefeatConfig{AuraCleanup: AuraCleanupDefeatConfig{DistinctAuras: 1, BurstWindow: time.Second, DamageWindow: time.Second}})
	original.active = true
	original.lastIncomingDamage = at
	state, err := original.CaptureState()
	require.NoError(t, err)
	data, err := state.Encode()
	require.NoError(t, err)
	var malformed map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(data, &malformed))
	malformed["cleanup_auras"] = json.RawMessage(`null`)
	invalid, err := json.Marshal(malformed)
	require.NoError(t, err)
	_, err = DecodeScriptedDefeatDetectorState(ScriptedDefeatDetectorStateVersion, invalid)
	require.Error(t, err)
	restored := NewScriptedDefeatDetector(2, ScriptedDefeatConfig{})
	bad := state
	bad.value.CleanupAuras = nil
	require.Error(t, restored.RestoreState(bad, nil))
	require.EqualValues(t, 2, restored.id)
	require.NotNil(t, restored.cleanupAuras)
	decoded, err := DecodeScriptedDefeatDetectorState(ScriptedDefeatDetectorStateVersion, data)
	require.NoError(t, err)
	require.NoError(t, restored.RestoreState(decoded, nil))
	require.NotNil(t, restored.cleanupAuras)
	require.Empty(t, restored.cleanupAuras)
	aura := &messages.Aura{Target: 1, State: types.AuraStateRemoved, SpellName: "test"}
	aura.MessageBase = messages.Base(at)
	expected, ok := original.Observe(aura, true)
	require.True(t, ok)
	require.Equal(t, ScriptedDefeatAuraCleanup, expected)
	actual, ok := restored.Observe(aura, true)
	require.True(t, ok)
	require.Equal(t, expected, actual)
}
