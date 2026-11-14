package consumeevidence

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func spellPath(spell *chrondbc.Spell) (string, error) {
	if spell == nil {
		return "", nil
	}
	return fmt.Sprintf("/spells/%d", spell.ID), nil
}

func spellResolver(spells map[chrondbc.SpellID]*chrondbc.Spell) func(string) (*chrondbc.Spell, error) {
	return func(path string) (*chrondbc.Spell, error) {
		var id int32
		if _, err := fmt.Sscanf(path, "/spells/%d", &id); err != nil {
			return nil, err
		}
		spell := spells[chrondbc.SpellID(id)]
		if spell == nil {
			return nil, fmt.Errorf("missing %s", path)
		}
		return spell, nil
	}
}

func trackerPayload(t *testing.T, state TrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func collectorPayload(t *testing.T, state CollectorState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func cloneConsume(ev *messages.Consume) *messages.Consume {
	clone := *ev
	clone.ItemID = clonePointer(ev.ItemID)
	clone.ItemName = clonePointer(ev.ItemName)
	clone.CandidateItemIDs = append([]int32(nil), ev.CandidateItemIDs...)
	clone.ConsumedAtUnixMs = clonePointer(ev.ConsumedAtUnixMs)
	clone.Amount = clonePointer(ev.Amount)
	clone.ResourceType = clonePointer(ev.ResourceType)
	return &clone
}

func TestTrackerStateContinuesCastDirectAndAuraCorrelation(t *testing.T) {
	t.Parallel()
	catalog := newTestCatalog()
	catalog.items[13446] = true
	player := testPlayerGUID()
	start := time.Date(2026, time.February, 1, 12, 0, 0, 0, time.UTC)
	castSpell := testSpell(17534)
	continuous := NewTracker(catalog)
	continuous.Process(&messages.SpellGo{MessageBase: messages.Base(start), Caster: player, SpellData: castSpell}, false)
	state, err := continuous.CaptureState(spellPath)
	require.NoError(t, err)
	payload := trackerPayload(t, state)
	decoded, err := DecodeTrackerState(TrackerStateVersion, payload)
	require.NoError(t, err)
	canonicalCast := testSpell(17534)
	canonicalAura := testSpellWithDuration(17538, 120000)
	spells := map[chrondbc.SpellID]*chrondbc.Spell{17534: canonicalCast, 17538: canonicalAura}
	restored, err := decoded.Restore(catalog, spellResolver(spells))
	require.NoError(t, err)
	require.Same(t, canonicalCast, restored.preCombatCastEpisodes[0].spellData)
	require.Same(t, canonicalCast, restored.preCombatEvidence[0].SpellData)

	for _, tracker := range []*Tracker{continuous, restored} {
		tracker.Process(&messages.Heal{MessageBase: messages.Base(start.Add(500 * time.Millisecond)), Caster: player, Target: player, SpellData: testSpell(17534), Amount: 1400}, false)
		itemID := int32(13461)
		direct := &messages.SpellGo{MessageBase: messages.Base(start.Add(5 * time.Second)), Caster: player, ItemID: &itemID, SpellData: testSpell(17538)}
		tracker.Process(direct, true)
		tracker.Process(&messages.Aura{MessageBase: messages.Base(start.Add(5500 * time.Millisecond)), Target: player, SpellData: testSpellWithDuration(17538, 120000), IsBuff: true, State: 1}, true)
	}
	require.Equal(t, continuous.preCombatEvidence, restored.preCombatEvidence)
	require.Equal(t, continuous.directEpisodes, restored.directEpisodes)
	require.Equal(t, continuous.auraEpisodes, restored.auraEpisodes)
	require.Equal(t, continuous.preCombatEvidence[0].ConsumeID, continuous.preCombatEvidence[1].ConsumeID)
	require.Equal(t, continuous.directEpisodes[0].consumeID, continuous.auraEpisodes[0].consumeID)
	require.Equal(t, payload, trackerPayload(t, state))
	require.Equal(t, payload, trackerPayload(t, decoded))
}

func TestTrackerAndCollectorsRestoreQueuedEvidenceBeforeSingleDrain(t *testing.T) {
	t.Parallel()
	catalog := newTestCatalog()
	player := testPlayerGUID()
	start := time.Date(2026, time.February, 1, 12, 0, 0, 0, time.UTC)
	itemID := int32(13461)
	spell := testSpell(17540)
	continuousTracker := NewTracker(catalog)
	continuousTracker.Process(&messages.SpellGo{MessageBase: messages.Base(start), Caster: player, ItemID: &itemID, SpellData: spell}, false)

	auraTracker := auras.New(nil)
	continuousCollectors := []*Collector{NewCollector(auraTracker, continuousTracker), NewCollector(auraTracker, continuousTracker)}
	for _, collector := range continuousCollectors {
		collector.FightStarted(uuid.New(), &messages.Damage{MessageBase: messages.Base(start.Add(time.Second))})
	}
	trackerState, err := continuousTracker.CaptureState(spellPath)
	require.NoError(t, err)
	collectorStates := make([]CollectorState, len(continuousCollectors))
	for i, collector := range continuousCollectors {
		collectorStates[i], err = collector.CaptureState(spellPath)
		require.NoError(t, err)
	}

	var continuousEmitted [2][]*messages.Consume
	for i, collector := range continuousCollectors {
		index := i
		collector.SetEmit(func(ev *messages.Consume) {
			continuousEmitted[index] = append(continuousEmitted[index], cloneConsume(ev))
		})
	}
	first := &messages.Damage{MessageBase: messages.Base(start.Add(time.Second))}
	for _, collector := range continuousCollectors {
		require.NoError(t, collector.ProcessMessage(true, uuid.Nil, first))
	}
	require.Len(t, continuousEmitted[0], 1)
	require.Empty(t, continuousEmitted[1])
	require.Nil(t, continuousTracker.preCombatEvidence)

	canonicalSpell := testSpell(17540)
	restoredTracker, err := trackerState.Restore(catalog, spellResolver(map[chrondbc.SpellID]*chrondbc.Spell{17540: canonicalSpell}))
	require.NoError(t, err)
	var restoredEmitted [2][]*messages.Consume
	restoredCollectors := make([]*Collector, len(collectorStates))
	for i, state := range collectorStates {
		restoredCollectors[i], err = state.Restore(auraTracker, restoredTracker, spellResolver(map[chrondbc.SpellID]*chrondbc.Spell{17540: canonicalSpell}))
		require.NoError(t, err)
		require.Same(t, restoredTracker, restoredCollectors[i].shared)
		require.Nil(t, restoredCollectors[i].emit, "restore must not attach callbacks")
		index := i
		restoredCollectors[i].SetEmit(func(ev *messages.Consume) { restoredEmitted[index] = append(restoredEmitted[index], cloneConsume(ev)) })
	}
	for _, collector := range restoredCollectors {
		require.NoError(t, collector.ProcessMessage(true, uuid.Nil, first))
	}
	require.Equal(t, continuousEmitted, restoredEmitted)
	require.Nil(t, restoredTracker.preCombatEvidence)
	require.Nil(t, restoredTracker.preCombatCastEpisodes)
	require.Empty(t, restoredTracker.DrainPreCombatEvidence(), "queued evidence is drained exactly once")
	require.Same(t, canonicalSpell, restoredEmitted[0][0].SpellData)
}

func TestCollectorStateContinuesCastEpisodeWithoutReemittingPrefix(t *testing.T) {
	t.Parallel()
	catalog := newTestCatalog()
	shared := NewTracker(catalog)
	collector := NewCollector(auras.New(nil), shared)
	player := testPlayerGUID()
	start := time.Date(2026, time.February, 1, 12, 0, 0, 0, time.UTC)
	var emitted []*messages.Consume
	collector.SetEmit(func(ev *messages.Consume) { emitted = append(emitted, cloneConsume(ev)) })
	collector.FightStarted(uuid.New(), nil)
	require.NoError(t, collector.ProcessMessage(true, uuid.Nil, &messages.Damage{MessageBase: messages.Base(start)}))
	require.NoError(t, collector.ProcessMessage(true, uuid.Nil, &messages.SpellGo{MessageBase: messages.Base(start), Caster: player, SpellData: testSpell(17534)}))
	require.Len(t, emitted, 1)
	prefixID := emitted[0].ConsumeID
	state, err := collector.CaptureState(spellPath)
	require.NoError(t, err)
	decoded, err := DecodeCollectorState(CollectorStateVersion, collectorPayload(t, state))
	require.NoError(t, err)
	canonicalSpell := testSpell(17534)
	rejected, err := decoded.Restore(collector.auraTracker, shared, func(string) (*chrondbc.Spell, error) { return nil, fmt.Errorf("resolve failed") })
	require.Error(t, err)
	require.Nil(t, rejected)
	require.Len(t, collector.castEpisodes, 1)
	restored, err := decoded.Restore(collector.auraTracker, shared, spellResolver(map[chrondbc.SpellID]*chrondbc.Spell{17534: canonicalSpell}))
	require.NoError(t, err)
	var restoredEmitted []*messages.Consume
	restored.SetEmit(func(ev *messages.Consume) { restoredEmitted = append(restoredEmitted, cloneConsume(ev)) })

	heal := &messages.Heal{MessageBase: messages.Base(start.Add(500 * time.Millisecond)), Caster: player, Target: player, SpellData: testSpell(17534), Amount: 1400}
	require.NoError(t, collector.ProcessMessage(true, uuid.Nil, heal))
	require.NoError(t, restored.ProcessMessage(true, uuid.Nil, heal))
	require.Len(t, emitted, 2)
	require.Len(t, restoredEmitted, 1, "restored collector must not regenerate already emitted cast evidence")
	require.Equal(t, prefixID, emitted[1].ConsumeID)
	require.Equal(t, emitted[1], restoredEmitted[0])
}

func TestConsumeEvidenceStatesRejectCorruptionAndRestoreAtomically(t *testing.T) {
	t.Parallel()
	catalog := newTestCatalog()
	player := testPlayerGUID()
	start := time.UnixMilli(1000)
	tracker := NewTracker(catalog)
	tracker.Process(&messages.SpellGo{MessageBase: messages.Base(start), Caster: player, SpellData: testSpell(17534)}, false)
	trackerState, err := tracker.CaptureState(spellPath)
	require.NoError(t, err)
	trackerPayload := trackerPayload(t, trackerState)
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeTrackerState(version, trackerPayload)
		require.Error(t, err)
	}
	for _, corrupt := range []string{"null", "{}", string(trackerPayload) + " {}", `{"direct_episodes":[],"direct_episodes":[]}`} {
		_, err := DecodeTrackerState(TrackerStateVersion, []byte(corrupt))
		require.Error(t, err, corrupt)
	}
	invalid, err := DecodeTrackerState(TrackerStateVersion, trackerPayload)
	require.NoError(t, err)
	invalid.value.PreCombatCastEpisodes[0].Spell = spellReferenceValue{ID: 17534}
	calls := 0
	candidate, err := invalid.Restore(catalog, func(string) (*chrondbc.Spell, error) {
		calls++
		return testSpell(17534), nil
	})
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Zero(t, calls, "invalid state must fail before resolving spells")

	candidate, err = trackerState.Restore(catalog, func(string) (*chrondbc.Spell, error) {
		calls++
		return nil, fmt.Errorf("resolve failed")
	})
	require.Error(t, err)
	require.Nil(t, candidate)
	require.Equal(t, 1, calls)
	require.Len(t, tracker.preCombatEvidence, 1)
	require.Len(t, tracker.preCombatCastEpisodes, 1)

	collector := NewCollector(auras.New(nil), tracker)
	collector.FightStarted(uuid.New(), nil)
	collectorState, err := collector.CaptureState(spellPath)
	require.NoError(t, err)
	collectorPayload := collectorPayload(t, collectorState)
	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeCollectorState(version, collectorPayload)
		require.Error(t, err)
	}
	var root map[string]any
	require.NoError(t, json.Unmarshal(collectorPayload, &root))
	root["unknown"] = true
	unknown, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeCollectorState(CollectorStateVersion, unknown)
	require.Error(t, err)
}
