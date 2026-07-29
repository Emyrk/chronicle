package consumeevidence

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testCatalog is a minimal ConsumableCatalog for testing.
type testCatalog struct {
	items map[int32]bool
	buffs map[chrondbc.SpellID][]int32
}

func (c *testCatalog) IsConsumableItem(itemID int32) bool {
	return c.items[itemID]
}

func (c *testCatalog) IsConsumableBuff(spellID chrondbc.SpellID) ([]int32, bool) {
	ids, ok := c.buffs[spellID]
	return ids, ok
}

func newTestCatalog() *testCatalog {
	return &testCatalog{
		items: map[int32]bool{
			13461: true, // Greater Stoneshield Potion
			13813: true, // Blessed Sunfruit Juice (flask-like)
		},
		buffs: map[chrondbc.SpellID][]int32{
			17624: {13510}, // Flask of the Titans → Flask item
			17538: {13461}, // Greater Stoneshield → item 13461
		},
	}
}

// testPlayerGUID returns a GUID that IsPlayer() == true.
func testPlayerGUID() guid.GUID {
	g, err := guid.FromString("Player-5324-01234567")
	if err != nil {
		return guid.GUID(0x0000000001234567)
	}
	return g
}

func testSpell(id chrondbc.SpellID) *chrondbc.Spell {
	return &chrondbc.Spell{ID: id}
}

func testSpellWithDuration(id chrondbc.SpellID, durationMS int32) *chrondbc.Spell {
	return &chrondbc.Spell{
		ID:       id,
		Duration: dbcmem.SpellDuration{MaxDuration: durationMS},
	}
}

func newTrackerAndCollector(tracker *auras.Tracking, cat ConsumableCatalog) (*Tracker, *Collector) {
	t := NewTracker(cat)
	col := NewCollector(tracker, t)
	return t, col
}

// newCollector is a convenience wrapper that returns only the Collector for
// tests that don't need direct access to the Tracker.
func newCollector(tracker *auras.Tracking, cat ConsumableCatalog) *Collector {
	_, col := newTrackerAndCollector(tracker, cat)
	return col
}

func collectEmitted(col *Collector) *[]*messages.Consume {
	var emitted []*messages.Consume
	col.SetEmit(func(ev *messages.Consume) {
		clone := *ev
		emitted = append(emitted, &clone)
	})
	return &emitted
}

func TestDirectItemEvidence(t *testing.T) {
	t.Parallel()

	cat := newTestCatalog()
	col := newCollector(auras.New(nil), cat)
	emitted := collectEmitted(col)

	ts := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	eid := uuid.New()
	itemID := int32(13461)
	player := testPlayerGUID()

	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(ts)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(ts)}))

	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(ts),
		ItemID:      &itemID,
		Caster:      player,
		SpellData:   testSpell(17540),
	}
	require.NoError(t, col.ProcessMessage(true, eid, spellGo))

	require.Len(t, *emitted, 1)
	ev := (*emitted)[0]
	assert.Equal(t, messages.EvidenceKindDirectItem, ev.Kind)
	assert.Equal(t, messages.ConfidenceDirect, ev.Confidence)
	assert.NotEmpty(t, ev.ConsumeID)
	assert.NotEmpty(t, ev.EvidenceID)
	assert.Equal(t, player, ev.Player)
	require.NotNil(t, ev.ItemID)
	assert.Equal(t, itemID, *ev.ItemID)
	require.NotNil(t, ev.ConsumedAtUnixMs)
	assert.Equal(t, ts.UnixMilli(), *ev.ConsumedAtUnixMs)
	assert.Equal(t, ts.UnixMilli(), ev.ObservedAtUnixMs)
	assert.False(t, ev.IsProjection)
}

func TestSpellGoWithoutItemIDNoEvidence(t *testing.T) {
	t.Parallel()

	col := newCollector(auras.New(nil), newTestCatalog())
	emitted := collectEmitted(col)

	ts := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	eid := uuid.New()

	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(ts)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(ts)}))

	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(ts),
		ItemID:      nil,
		Caster:      testPlayerGUID(),
		SpellData:   testSpell(133),
	}
	require.NoError(t, col.ProcessMessage(true, eid, spellGo))
	assert.Empty(t, *emitted)
}

// TestNonConsumableBuffIgnored verifies that active buffs not in the catalog
// are not emitted as consume evidence.
func TestNonConsumableBuffIgnored(t *testing.T) {
	t.Parallel()

	tracker := auras.New(nil)
	cat := newTestCatalog()
	col := newCollector(tracker, cat)
	emitted := collectEmitted(col)

	player := testPlayerGUID()
	ts := time.Date(2024, 1, 1, 11, 59, 50, 0, time.UTC)
	pullTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	eid := uuid.New()

	// Apply a non-consumable buff (spell not in catalog).
	tracker.Process(&messages.Aura{
		MessageBase: messages.Base(ts),
		Target:      player,
		SpellName:   "Power Word: Fortitude",
		SpellData:   testSpellWithDuration(1243, 1800000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	})

	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(pullTime)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(pullTime)}))

	// Non-consumable buff should NOT be projected.
	assert.Empty(t, *emitted, "non-consumable buff should not produce consume evidence")
}

// TestPrePotProjectedAcrossEncounters verifies the user's exact model:
// First pre-pot/aura projected across 3 encounters, second application
// projected across 6 encounters, yielding 2 distinct consume IDs after
// evidence-ID dedup.
func TestPrePotProjectedAcrossEncounters(t *testing.T) {
	t.Parallel()

	auraTracker := auras.New(nil)
	cat := newTestCatalog()
	trk, col := newTrackerAndCollector(auraTracker, cat)
	emitted := collectEmitted(col)

	player := testPlayerGUID()
	flaskSpell := chrondbc.SpellID(17624)

	// First application at T-10s (pre-pull).
	app1Time := time.Date(2024, 1, 1, 11, 59, 50, 0, time.UTC)
	app1Aura := &messages.Aura{
		MessageBase: messages.Base(app1Time),
		Target:      player,
		SpellName:   "Flask of the Titans",
		SpellData:   testSpellWithDuration(flaskSpell, 7200000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(app1Aura)
	// Record aura episode parse-wide via tracker.
	trk.Process(app1Aura)

	// Encounters 1–3 with first application active.
	for i := 0; i < 3; i++ {
		pullTime := time.Date(2024, 1, 1, 12, i*5, 0, 0, time.UTC)
		eid := uuid.New()
		col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(pullTime)})
		require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(pullTime)}))
		col.FightEnded(eid, &messages.Damage{MessageBase: messages.Base(pullTime.Add(time.Minute))})
	}

	firstAppProjections := len(*emitted)
	require.Equal(t, 3, firstAppProjections, "first application projected into 3 encounters")
	firstConsumeID := (*emitted)[0].ConsumeID

	// All 3 projections share the same consume ID.
	for _, ev := range (*emitted)[:3] {
		assert.Equal(t, firstConsumeID, ev.ConsumeID, "same application → same consume ID")
		assert.True(t, ev.IsProjection)
	}

	// Second application at T+20min.
	app2Time := time.Date(2024, 1, 1, 12, 20, 0, 0, time.UTC)
	// Simulate re-application: remove old and add new.
	app2Aura := &messages.Aura{
		MessageBase: messages.Base(app2Time),
		Target:      player,
		SpellName:   "Flask of the Titans",
		SpellData:   testSpellWithDuration(flaskSpell, 7200000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(app2Aura)
	trk.Process(app2Aura)

	// Encounters 4–9 with second application active.
	for i := 0; i < 6; i++ {
		pullTime := time.Date(2024, 1, 1, 12, 25+i*5, 0, 0, time.UTC)
		eid := uuid.New()
		col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(pullTime)})
		require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(pullTime)}))
		col.FightEnded(eid, &messages.Damage{MessageBase: messages.Base(pullTime.Add(time.Minute))})
	}

	totalEvents := len(*emitted)
	require.Equal(t, 9, totalEvents, "3 from first app + 6 from second app")

	secondConsumeID := (*emitted)[3].ConsumeID

	// All 6 projections of second app share a different consume ID.
	for _, ev := range (*emitted)[3:9] {
		assert.Equal(t, secondConsumeID, ev.ConsumeID, "same second application → same consume ID")
		assert.True(t, ev.IsProjection)
	}

	// The two consume IDs are distinct.
	assert.NotEqual(t, firstConsumeID, secondConsumeID,
		"distinct applications must get distinct consume IDs")

	// Evidence IDs are all stable (same evidence ID for same consume+kind).
	evidenceIDs := make(map[string]int)
	for _, ev := range *emitted {
		evidenceIDs[ev.EvidenceID]++
	}
	// All projections of the same application share the same evidence ID,
	// verifying cross-encounter stability. 3+6=9 events but only 2 unique
	// evidence IDs (one per application).
	assert.Len(t, evidenceIDs, 2,
		"should have 2 unique evidence IDs (one per distinct application)")
}

// TestDirectAndAuraSharedConsumeID verifies that a direct item-use SpellGo
// (A1) and its matching aura gain (A2) share the same consume ID.
func TestDirectAndAuraSharedConsumeID(t *testing.T) {
	t.Parallel()

	auraTracker := auras.New(nil)
	cat := newTestCatalog()
	// Add item 13461 buff spell 17538 to catalog for correlation.
	trk, col := newTrackerAndCollector(auraTracker, cat)
	emitted := collectEmitted(col)

	player := testPlayerGUID()
	ts := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	eid := uuid.New()
	itemID := int32(13461)

	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(ts)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(ts)}))

	// Direct item use (A1). Tracker records the episode.
	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(ts),
		ItemID:      &itemID,
		Caster:      player,
		SpellData:   testSpell(17538),
	}
	trk.Process(spellGo)
	require.NoError(t, col.ProcessMessage(true, eid, spellGo))

	// Matching aura gain within 2s (A2).
	auraTime := ts.Add(500 * time.Millisecond)
	auraMsg := &messages.Aura{
		MessageBase: messages.Base(auraTime),
		Target:      player,
		SpellName:   "Greater Stoneshield",
		SpellData:   testSpellWithDuration(17538, 120000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(auraMsg)
	trk.Process(auraMsg)
	require.NoError(t, col.ProcessMessage(true, eid, auraMsg))

	require.Len(t, *emitted, 2, "should emit both A1 direct and A2 aura")

	directEv := (*emitted)[0]
	auraEv := (*emitted)[1]

	assert.Equal(t, messages.EvidenceKindDirectItem, directEv.Kind)
	assert.Equal(t, messages.EvidenceKindAura, auraEv.Kind)

	// Same consume ID for both.
	assert.Equal(t, directEv.ConsumeID, auraEv.ConsumeID,
		"direct and correlated aura evidence should share consume ID")

	// Different evidence IDs.
	assert.NotEqual(t, directEv.EvidenceID, auraEv.EvidenceID,
		"evidence IDs should differ between direct and aura observations")

	// Aura gets promoted to ConfidenceDirect since it correlated with direct.
	assert.Equal(t, messages.ConfidenceDirect, auraEv.Confidence)
}

// TestOptionalConsumedAtTime verifies that active-at-pull projections have nil
// ConsumedAtUnixMs since the actual use time is unknown.
func TestOptionalConsumedAtTime(t *testing.T) {
	t.Parallel()

	auraTracker := auras.New(nil)
	cat := newTestCatalog()
	trk, col := newTrackerAndCollector(auraTracker, cat)
	emitted := collectEmitted(col)

	player := testPlayerGUID()
	prePullTime := time.Date(2024, 1, 1, 11, 59, 50, 0, time.UTC)
	pullTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	eid := uuid.New()

	auraMsg := &messages.Aura{
		MessageBase: messages.Base(prePullTime),
		Target:      player,
		SpellName:   "Flask of the Titans",
		SpellData:   testSpellWithDuration(17624, 7200000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(auraMsg)
	trk.Process(auraMsg)

	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(pullTime)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(pullTime)}))

	require.Len(t, *emitted, 1)
	assert.Nil(t, (*emitted)[0].ConsumedAtUnixMs,
		"active-at-pull evidence should have nil ConsumedAtUnixMs since actual consume time is unknown")
}

func TestConsumeIDDeterministic(t *testing.T) {
	t.Parallel()

	player := testPlayerGUID()
	spell := testSpell(17540)
	itemID := int32(13461)
	ts := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	id1 := StableConsumeID("direct", player, spell, &itemID, ts)
	id2 := StableConsumeID("direct", player, spell, &itemID, ts)

	assert.Equal(t, id1, id2, "same inputs should produce the same consume ID")
	assert.Len(t, id1, 16, "consume ID should be 16 hex chars")
}

func TestAuraConsumeIDDeterministic(t *testing.T) {
	t.Parallel()

	player := testPlayerGUID()
	spellID := chrondbc.SpellID(17624)
	appliedAt := time.Date(2024, 1, 1, 11, 59, 50, 0, time.UTC)

	id1 := StableAuraConsumeID(player, spellID, appliedAt)
	id2 := StableAuraConsumeID(player, spellID, appliedAt)

	assert.Equal(t, id1, id2, "same inputs should produce the same aura consume ID")
	assert.Len(t, id1, 16)

	// Different appliedAt → different ID.
	laterApplied := appliedAt.Add(time.Minute)
	id3 := StableAuraConsumeID(player, spellID, laterApplied)
	assert.NotEqual(t, id1, id3, "different application times should produce different IDs")
}

// TestInactiveFightCapturesDirectEpisodeParseWide verifies that direct item
// SpellGo events are recorded parse-wide even when active=false, so pre-pot
// evidence is available for later encounter projection.
func TestInactiveFightCapturesDirectEpisodeParseWide(t *testing.T) {
	t.Parallel()

	auraTracker := auras.New(nil)
	cat := newTestCatalog()
	trk, col := newTrackerAndCollector(auraTracker, cat)
	emitted := collectEmitted(col)

	player := testPlayerGUID()
	prePotTime := time.Date(2024, 1, 1, 11, 59, 55, 0, time.UTC)
	pullTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	itemID := int32(13461)

	// Pre-pot item use outside combat (active=false). Tracker records it.
	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(prePotTime),
		ItemID:      &itemID,
		Caster:      player,
		SpellData:   testSpell(17538),
	}
	trk.Process(spellGo)

	// No emission yet (not active).
	assert.Empty(t, *emitted, "should not emit during inactive fight")

	// But the direct episode is recorded for later correlation.
	assert.Equal(t, 1, trk.DirectEpisodeCount(), "should record direct episode parse-wide")

	// Now the aura appears and gets recorded.
	auraMsg := &messages.Aura{
		MessageBase: messages.Base(prePotTime.Add(100 * time.Millisecond)),
		Target:      player,
		SpellName:   "Greater Stoneshield",
		SpellData:   testSpellWithDuration(17538, 120000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(auraMsg)
	trk.Process(auraMsg)

	// Fight starts → projection should emit with the pre-pot's consume ID.
	eid := uuid.New()
	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(pullTime)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(pullTime)}))

	require.Len(t, *emitted, 2, "should project direct and active-at-pull evidence")
	assert.Equal(t, (*emitted)[0].ConsumeID, (*emitted)[1].ConsumeID)
	assert.NotEqual(t, (*emitted)[0].EvidenceID, (*emitted)[1].EvidenceID)
	assert.Equal(t, messages.EvidenceKindDirectItem, (*emitted)[0].Kind)
	assert.Equal(t, messages.EvidenceKindActiveAtPull, (*emitted)[1].Kind)
	assert.True(t, (*emitted)[0].IsProjection)
	assert.True(t, (*emitted)[1].IsProjection)
	require.NotNil(t, (*emitted)[0].ConsumedAtUnixMs)
	assert.Nil(t, (*emitted)[1].ConsumedAtUnixMs)
}

// TestResourceTypeStringRoundtrip verifies that ResourceType is an optional
// string matching ResourceChange.resourceType.
func TestResourceTypeStringRoundtrip(t *testing.T) {
	t.Parallel()

	mana := "Mana"
	ev := &messages.Consume{
		ResourceType: &mana,
	}
	require.NotNil(t, ev.ResourceType)
	assert.Equal(t, "Mana", *ev.ResourceType)

	// Nil is also valid.
	ev2 := &messages.Consume{}
	assert.Nil(t, ev2.ResourceType)
}

// TestProjectionDeduplicatesWithRawEvidence verifies that a raw evidence event
// and its projection at encounter start do not both appear.
func TestProjectionDeduplicatesWithRawEvidence(t *testing.T) {
	t.Parallel()

	auraTracker := auras.New(nil)
	cat := newTestCatalog()
	trk, col := newTrackerAndCollector(auraTracker, cat)
	emitted := collectEmitted(col)

	player := testPlayerGUID()
	prePullTime := time.Date(2024, 1, 1, 11, 59, 50, 0, time.UTC)
	pullTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	eid := uuid.New()

	// Apply consumable aura before pull.
	auraMsg := &messages.Aura{
		MessageBase: messages.Base(prePullTime),
		Target:      player,
		SpellName:   "Flask of the Titans",
		SpellData:   testSpellWithDuration(17624, 7200000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(auraMsg)
	trk.Process(auraMsg)

	col.FightStarted(eid, &messages.Damage{MessageBase: messages.Base(pullTime)})
	require.NoError(t, col.ProcessMessage(true, eid, &messages.Damage{MessageBase: messages.Base(pullTime)}))

	// Should emit exactly 1 (not 2) for the same aura.
	count := 0
	for _, ev := range *emitted {
		if ev.ConsumeID != "" {
			count++
		}
	}
	assert.Equal(t, 1, count, "should not duplicate raw evidence and its projection")
}

// TestParseWideStateSurvivesSeparateCollectors verifies that episodes recorded
// by the shared Tracker before any instance exists are available to a Collector
// created later. This proves the architectural requirement that episode
// ownership is parse-wide, not per-instance.
func TestParseWideStateSurvivesSeparateCollectors(t *testing.T) {
	t.Parallel()

	auraTracker := auras.New(nil)
	cat := newTestCatalog()
	trk := NewTracker(cat)

	player := testPlayerGUID()
	prePotTime := time.Date(2024, 1, 1, 11, 59, 55, 0, time.UTC)
	pullTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	itemID := int32(13461)

	// --- Phase 1: messages arrive before any Collector exists ---
	// (simulates messages processed before any instance is entered)

	// Direct item use recorded parse-wide.
	spellGo := &messages.SpellGo{
		MessageBase: messages.Base(prePotTime),
		ItemID:      &itemID,
		Caster:      player,
		SpellData:   testSpell(17538),
	}
	trk.Process(spellGo)

	// Corresponding aura gain.
	auraMsg := &messages.Aura{
		MessageBase: messages.Base(prePotTime.Add(100 * time.Millisecond)),
		Target:      player,
		SpellName:   "Greater Stoneshield",
		SpellData:   testSpellWithDuration(17538, 120000),
		IsBuff:      true,
		Amount:      1,
		State:       1,
	}
	auraTracker.Process(auraMsg)
	trk.Process(auraMsg)

	assert.Equal(t, 1, trk.DirectEpisodeCount(), "tracker should hold the direct episode")

	// --- Phase 2: first Collector is created (simulates entering an instance) ---
	col1 := NewCollector(auraTracker, trk)
	var emitted1 []*messages.Consume
	col1.SetEmit(func(ev *messages.Consume) {
		clone := *ev
		emitted1 = append(emitted1, &clone)
	})

	eid1 := uuid.New()
	col1.FightStarted(eid1, &messages.Damage{MessageBase: messages.Base(pullTime)})
	require.NoError(t, col1.ProcessMessage(true, eid1, &messages.Damage{MessageBase: messages.Base(pullTime)}))

	// Should project the pre-pot evidence from shared tracker.
	require.GreaterOrEqual(t, len(emitted1), 1, "collector1 should project pre-pot from shared tracker")
	assert.True(t, emitted1[0].IsProjection)

	col1.FightEnded(eid1, &messages.Damage{MessageBase: messages.Base(pullTime.Add(time.Minute))})

	// --- Phase 3: second Collector (simulates a different instance) ---
	col2 := NewCollector(auraTracker, trk)
	var emitted2 []*messages.Consume
	col2.SetEmit(func(ev *messages.Consume) {
		clone := *ev
		emitted2 = append(emitted2, &clone)
	})

	pull2Time := pullTime.Add(5 * time.Minute)
	eid2 := uuid.New()
	col2.FightStarted(eid2, &messages.Damage{MessageBase: messages.Base(pull2Time)})
	require.NoError(t, col2.ProcessMessage(true, eid2, &messages.Damage{MessageBase: messages.Base(pull2Time)}))

	// Second collector should also see the same evidence.
	require.GreaterOrEqual(t, len(emitted2), 1, "collector2 should also project pre-pot from shared tracker")

	// Consume IDs must be stable across collectors.
	assert.Equal(t, emitted1[0].ConsumeID, emitted2[0].ConsumeID,
		"same episode projected through different collectors must produce the same consume ID")
	assert.Equal(t, emitted1[0].EvidenceID, emitted2[0].EvidenceID,
		"same episode projected through different collectors must produce the same evidence ID")
}
