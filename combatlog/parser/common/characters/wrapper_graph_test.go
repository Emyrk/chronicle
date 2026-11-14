package characters

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestWrapperGraphCanonicalOwners(t *testing.T) {
	t.Parallel()
	recipe := TrustedFactoryRecipe{ID: "wrapper-test"}
	idRecipe := identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	id, e := idRecipe.New()
	require.NoError(t, e)
	all, e := recipe.New(unitdb.New(), id)
	require.NoError(t, e)
	common := NewCommonCharacter(1, all)
	permanent := &PermanentDeath{CharacterBase: common, dead: true}
	starts := &StartsNewFight{CharacterBase: permanent}
	death := &DeathOnCast{CharacterBase: starts, spellID: 123}
	ignore := &IgnoreCast{CharacterBase: death, ignoreSource: true, ignoreSpells: map[chrondbc.SpellID]struct{}{123: {}}}
	friendly := &IgnoreFriendlyFire{CharacterBase: ignore, friends: map[uint32]struct{}{456: {}}}
	detector := NewScriptedDefeatDetector(1, ScriptedDefeatConfig{Evade: true, EvadeConfirmationWindow: time.Second})
	detector.active = true
	detector.pendingEvade = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	detector.WithParticipantOwner(all)
	wrapper := &scriptedDefeatCharacter{Character: friendly, defeat: detector}
	all.All.Add(wrapper, detector.pendingEvade)
	all.Save("common", common)
	value := NewNeverActive(guid.GUID(2))
	pointer := NewNeverActive(guid.GUID(3))
	all.All.Add(value, detector.pendingEvade)
	all.All.Add(&pointer, detector.pendingEvade)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r, GraphOptions{Factories: recipe, Identifier: idRecipe}))
	require.NoError(t, RegisterWrapperGraphOwners(r))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
	snap, e := r.Capture(all)
	require.NoError(t, e)
	data, e := json.Marshal(snap)
	require.NoError(t, e)
	path := filepath.Join(t.TempDir(), "wrappers.json")
	require.NoError(t, os.WriteFile(path, data, 0600))
	data, e = os.ReadFile(path)
	require.NoError(t, e)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(data, &disk))
	for i, node := range disk.Graph.Nodes {
		if node.Kind != "value" || node.Type != CommonStateType {
			continue
		}
		var envelope struct {
			Version uint32           `json:"version"`
			Data    commonGraphValue `json:"data"`
		}
		require.NoError(t, json.Unmarshal(node.Metadata, &envelope))
		envelope.Data.TimeoutRecipe = "archive-executable"
		invalid := disk
		invalid.Graph.Nodes = slices.Clone(disk.Graph.Nodes)
		invalid.Graph.Nodes[i].Metadata, e = json.Marshal(envelope)
		require.NoError(t, e)
		_, err := r.Restore(invalid)
		require.Error(t, err, "unknown timeout recipes must fail closed")
	}
	for i, node := range disk.Graph.Nodes {
		if node.Kind != "value" || node.Type != ScriptedDefeatDetectorStateType {
			continue
		}
		var envelope struct {
			Version uint32     `json:"version"`
			Data    graphValue `json:"data"`
		}
		require.NoError(t, json.Unmarshal(node.Metadata, &envelope))
		var wrongRef string
		for _, candidate := range disk.Graph.Nodes {
			if candidate.Kind == "value" && candidate.Type == CommonStateType {
				wrongRef = string(candidate.Path)
			}
		}
		for _, ref := range []string{"", wrongRef} {
			envelope.Data.Refs = map[string]string{"participants": ref}
			invalid := disk
			invalid.Graph.Nodes = slices.Clone(disk.Graph.Nodes)
			invalid.Graph.Nodes[i].Metadata, e = json.Marshal(envelope)
			require.NoError(t, e)
			_, err := r.Restore(invalid)
			require.Error(t, err, "missing/mistyped participant owner must fail closed")
		}
	}
	root, e := r.Restore(disk)
	require.NoError(t, e)
	restored := root.(*Characters)
	restoredValue, ok := restored.Get(2)
	require.True(t, ok)
	require.IsType(t, NeverActive{}, restoredValue)
	restoredPointer, ok := restored.Get(3)
	require.True(t, ok)
	require.IsType(t, &NeverActive{}, restoredPointer)
	beforeWire, ok := restored.Get(1)
	require.True(t, ok)
	require.Nil(t, beforeWire.(*scriptedDefeatCharacter).defeat.config.AuraCleanup.NoKnownParticipantsAlive, "load must not attach participant callback")
	require.NoError(t, restored.WireGraphRuntime())
	ch, ok := restored.Get(1)
	require.True(t, ok)
	restoredWrapper := ch.(*scriptedDefeatCharacter)
	restoredCommon := restoredWrapper.Character.(*IgnoreFriendlyFire).CharacterBase.(*IgnoreCast).CharacterBase.(*DeathOnCast).CharacterBase.(*StartsNewFight).CharacterBase.(*PermanentDeath).CharacterBase
	shared, ok := restored.Load("common")
	require.True(t, ok)
	require.Same(t, shared, restoredCommon)
	require.Equal(t, detector.pendingEvade, restoredWrapper.defeat.pendingEvade)
	require.Same(t, restored, restoredWrapper.defeat.participantOwner)
	again, e := r.Capture(restored)
	require.NoError(t, e)
	require.Equal(t, snap, again)
	for _, c := range []*Characters{all, restored} {
		_, e = c.Process(messages.TimedOut(detector.pendingEvade.Add(time.Second * 2)))
		require.NoError(t, e)
	}
	expected, e := r.Capture(all)
	require.NoError(t, e)
	actual, e := r.Capture(restored)
	require.NoError(t, e)
	require.Equal(t, expected, actual)
	otherID, err := idRecipe.New()
	require.NoError(t, err)
	other, e := recipe.New(unitdb.New(), otherID)
	require.NoError(t, e)
	detector.WithParticipantOwner(other)
	_, err = r.Capture(all)
	require.Error(t, err, "wrong Characters owner must be rejected")
	detector.WithParticipantOwner(all)
	calls := 0
	untrusted := NewScriptedDefeatDetector(4, ScriptedDefeatConfig{AuraCleanup: AuraCleanupDefeatConfig{NoKnownParticipantsAlive: func() bool { calls++; return true }}})
	_, err = r.Capture(untrusted)
	require.Error(t, err)
	require.Zero(t, calls)
	common.WithTimeoutAsDeathIf(func(*Characters) bool { calls++; return true })
	_, err = r.Capture(all)
	require.Error(t, err)
	require.Zero(t, calls)
	_, e = r.Capture(new(int))
	require.Error(t, e, "unregistered concrete owners fail closed")
}

func TestWrapperGraphTimeoutRecipeCycle(t *testing.T) {
	t.Parallel()
	recipe := TrustedFactoryRecipe{ID: "timeout-cycle"}
	idRecipe := identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	id, e := idRecipe.New()
	require.NoError(t, e)
	all, e := recipe.New(unitdb.New(), id)
	require.NoError(t, e)
	common := NewCommonCharacter(1, all).WithTimeoutAsDeathWhileEntryAlive(77)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	common.Start("prefix", messages.TimedOut(at))
	all.All.Add(common, at)
	all.Save("same-common", common)
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r, GraphOptions{Factories: recipe, Identifier: idRecipe}))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
	snap, e := r.Capture(all)
	require.NoError(t, e)
	root, e := r.Restore(snap)
	require.NoError(t, e)
	fresh := root.(*Characters)
	ch, ok := fresh.Get(1)
	require.True(t, ok)
	restored := ch.(*Common)
	require.Nil(t, restored.timeoutAsDeathIf, "load must not attach runtime callback")
	require.True(t, restored.IsActive(), "load must not evaluate timeout/gameplay")
	shared, ok := fresh.Load("same-common")
	require.True(t, ok)
	require.Same(t, restored, shared)
	require.Same(t, fresh, restored.Lookup())
	require.NoError(t, fresh.WireGraphRuntime())
	require.NotNil(t, restored.timeoutAsDeathIf)
	again, e := r.Capture(fresh)
	require.NoError(t, e)
	require.Equal(t, snap, again)
	for i, node := range snap.Graph.Nodes {
		if node.Kind != "value" || node.Type != CommonStateType {
			continue
		}
		for _, recipe := range []string{"", "unknown"} {
			var envelope struct {
				Version uint32           `json:"version"`
				Data    commonGraphValue `json:"data"`
			}
			require.NoError(t, json.Unmarshal(node.Metadata, &envelope))
			envelope.Data.TimeoutRecipe = recipe
			envelope.Data.TimeoutEntry = 0
			bad := snap
			bad.Graph.Nodes = slices.Clone(snap.Graph.Nodes)
			bad.Graph.Nodes[i].Metadata, e = json.Marshal(envelope)
			require.NoError(t, e)
			_, err := r.Restore(bad)
			require.Error(t, err, "active period must reject missing/unknown owner recipe")
		}
	}
}
