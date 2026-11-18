package messages

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/playerposition"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestObservedGUIDsIncludesPassiveReferences(t *testing.T) {
	t.Parallel()
	owner, charm := guid.GUID(2), guid.GUID(3)
	for _, test := range []struct {
		message Message
		want    []guid.GUID
	}{
		{&Unit{Info: unitinfo.Info{Guid: 1, Owner: &owner, Charm: &charm}}, []guid.GUID{1, 2, 3}},
		{&Versions{Player: &owner}, []guid.GUID{2}},
		{&PlayerPosition{PlayerPosition: playerposition.PlayerPosition{Guid: owner.String()}}, []guid.GUID{2}},
		{&UnitClassificationEvent{Target: 1, Owner: &owner, Controller: &charm}, []guid.GUID{1, 2, 3}},
		{&ThreatTank{Entries: []ThreatTankEntry{{ServerGUID: owner.String()}, {ServerGUID: "invalid"}}}, []guid.GUID{2}},
		{&NewOwner{Target: 2, NewOwner: 2}, []guid.GUID{2}},
		{&SpellGo{Caster: 1, Target: &owner, CorpseOwner: &charm}, []guid.GUID{1, 2, 3}},
		{&VehicleControl{VehicleGUID: 1, ControllerGUID: 2}, []guid.GUID{1, 2}},
		{&Damage{Target: 0}, []guid.GUID{}},
	} {
		require.Equal(t, test.want, ObservedGUIDs(test.message), "%T", test.message)
	}
	// Catalogue-only references must not alter encounter detection.
	require.Equal(t, []guid.GUID{1}, (&Unit{Info: unitinfo.Info{Guid: 1, Owner: &owner}}).Affects())
}

func TestObservedGUIDsExcludesRaidMarkers(t *testing.T) {
	t.Parallel()
	id := guid.GUID(0xF1300036B7000001)
	for _, index := range []uint8{0, 1, 8} {
		marker := &RaidMark{Unit: id, Index: index}
		require.Nil(t, ObservedGUIDs(marker))
		require.Equal(t, []guid.GUID{id}, marker.Affects(), "marker consumers still receive the affected unit")
		require.Equal(t, index, marker.Index)
	}
	require.Equal(t, []guid.GUID{id}, ObservedGUIDs(&Unit{Info: unitinfo.Info{Guid: id}}))
}
