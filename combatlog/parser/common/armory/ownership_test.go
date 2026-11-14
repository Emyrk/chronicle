package armory

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestPlayerOwnershipAcrossInstances(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	first, second := New(units), New(units)
	gid := guid.GUID(1)
	msg := &messages.Combatant{Combatant: combatant.Combatant{Guid: gid, Name: "Player", GearSetups: []combatant.GearItem{{ItemID: 100}}}}
	observe := func(tracker *Tracker, m messages.Message) {
		t.Helper()
		// Actual order: encounter state and Hookable update Units before armory.
		require.NoError(t, units.ProcessMessage(m))
		require.NoError(t, units.ProcessMessage(m))
		require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, m))
	}
	observe(first, msg)
	observe(second, &messages.Combatant{Combatant: combatant.Combatant{Guid: gid, Name: "Player", GearSetups: []combatant.GearItem{{ItemID: 200}}}})
	current, ok := first.CurrentPlayer(gid)
	require.True(t, ok)
	require.Equal(t, 200, current.GearSetups[0].ItemID)
	require.Equal(t, 100, first.PlayerObservations[gid].GearSetups[0].ItemID)
	observe(second, &messages.Transmog{PlayerName: "Player", Transmogs: []combatant.Transmog{{Slot: 0, ItemID: 300, TransmogID: 400}}})
	require.Equal(t, 100, msg.GearSetups[0].ItemID)
	require.Equal(t, 100, first.PlayerObservations[gid].GearSetups[0].ItemID)
	require.Equal(t, 300, second.PlayerObservations[gid].GearSetups[0].ItemID)
	// Revisit first with unreadable gear: canonical fallback happens before
	// either duplicate ProcessMessage can discard the last known equipment.
	observe(first, &messages.Combatant{Combatant: combatant.Combatant{Guid: gid, Name: "Player", GearSetups: []combatant.GearItem{{}}}})
	require.Equal(t, 300, first.PlayerObservations[gid].GearSetups[0].ItemID)
	observe(first, &messages.Transmog{PlayerName: "Player", Transmogs: []combatant.Transmog{{Slot: 0, ItemID: 500}}})
	require.Equal(t, 300, second.PlayerObservations[gid].GearSetups[0].ItemID)
	require.Equal(t, 500, units.Players[gid].GearSetups[0].ItemID)
	// Parse-wide knowledge never creates instance membership.
	third := New(units)
	_, ok = third.CurrentPlayer(gid)
	require.False(t, ok)
}

func TestPlayerOwnershipDetachedTalents(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := New(units)
	gid := guid.GUID(1)
	original := &messages.Combatant{Combatant: combatant.Combatant{Guid: gid, Name: "Player", Talents: &combatant.Talents{Trees: [3][]uint8{{1}}}}}
	tracker.Player(original)
	original.Talents.Trees[0][0] = 9
	require.Equal(t, uint8(1), units.Players[gid].Talents.Trees[0][0])
	replacement := &combatant.Talents{Trees: [3][]uint8{{2}}}
	units.UpdatePlayerTalents(gid, replacement)
	replacement.Trees[0][0] = 9
	require.Equal(t, uint8(2), units.Players[gid].Talents.Trees[0][0])
	require.Equal(t, uint8(1), tracker.PlayerObservations[gid].Talents.Trees[0][0])
}

func TestPendingTalentsUseCanonicalPlayerAfterMetadata(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := New(units)
	gid := guid.GUID(1)
	talents := &messages.CombatantTalents{Guid: gid, PlayerName: "Player", Tabs: [3]messages.CombatantTalentTab{{TabName: "Arcane", RankDigits: "51"}}}
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, talents))
	require.Contains(t, tracker.PendingTalents, gid)
	_, ok := units.GetPlayer(gid)
	require.False(t, ok)
	msg := &messages.Combatant{Combatant: combatant.Combatant{Guid: gid, Name: "Player"}}
	require.NoError(t, units.ProcessMessage(msg))
	require.NoError(t, units.ProcessMessage(msg))
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, msg))
	require.Empty(t, tracker.PendingTalents)
	require.Equal(t, "Arcane", units.Players[gid].Talents.TabNames[0])
	require.Equal(t, uint8(6), tracker.PlayerObservations[gid].Talents.Summary[0])
}

func TestSameNameTransmogUsesLastObservedGUID(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := New(units)
	for _, id := range []guid.GUID{1, 2} {
		tracker.Player(&messages.Combatant{Combatant: combatant.Combatant{Guid: id, Name: "Same", GearSetups: []combatant.GearItem{{ItemID: int(id)}}}})
	}
	tracker.Transmog(&messages.Transmog{PlayerName: "Same", Transmogs: []combatant.Transmog{{Slot: 0, ItemID: 99}}})
	require.Equal(t, 1, units.Players[1].GearSetups[0].ItemID)
	require.Equal(t, 99, units.Players[2].GearSetups[0].ItemID)
	require.Equal(t, 1, tracker.PlayerObservations[1].GearSetups[0].ItemID)
	require.Equal(t, 99, tracker.PlayerObservations[2].GearSetups[0].ItemID)
}

func TestDetailedTalentsAfterRespecSequence(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := New(units)
	id := guid.GUID(1)
	initial := &messages.Combatant{Combatant: combatant.Combatant{Guid: id, Name: "Player", Talents: &combatant.Talents{Summary: [3]uint8{6}, Trees: [3][]uint8{{5, 1}}}}}
	process := func(m messages.Message) {
		t.Helper()
		require.NoError(t, units.ProcessMessage(m))
		require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, m))
	}
	process(initial)
	process(&messages.Aura{Target: id, State: types.AuraStateAdded, SpellData: &chrondbc.Spell{ID: respecAuraSpellID}})
	process(initial)
	require.Nil(t, units.Players[id].Talents)
	process(&messages.Aura{Target: id, State: types.AuraStateRemoved, SpellData: &chrondbc.Spell{ID: respecAuraSpellID}})
	require.Nil(t, units.Players[id].Talents)
	process(&messages.CombatantTalents{Guid: id, PlayerName: "Player", Tabs: [3]messages.CombatantTalentTab{{TabName: "Arcane", RankDigits: "51"}}})
	require.Equal(t, [3]uint8{6}, units.Players[id].Talents.Summary)
	require.Equal(t, "Arcane", units.Players[id].Talents.TabNames[0])
	require.NotContains(t, tracker.InvalidatedTalents, id)
	require.Equal(t, units.Players[id].Talents, tracker.PlayerObservations[id].Talents)
}
