package armory

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
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
