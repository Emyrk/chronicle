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
		require.Equal(t, test.want, ObservedGUIDs(test.message, ObservationPolicy{}), "%T", test.message)
	}
	// Catalogue-only references must not alter encounter detection.
	require.Equal(t, []guid.GUID{1}, (&Unit{Info: unitinfo.Info{Guid: 1, Owner: &owner}}).Affects())
}

func TestObservedGUIDsExcludesRaidMarkers(t *testing.T) {
	t.Parallel()
	id := guid.GUID(0xF1300036B7000001)
	for _, index := range []uint8{0, 1, 8} {
		marker := &RaidMark{Unit: id, Index: index}
		require.Nil(t, ObservedGUIDs(marker, ObservationPolicy{}))
		require.Equal(t, []guid.GUID{id}, marker.Affects(), "marker consumers still receive the affected unit")
		require.Equal(t, index, marker.Index)
	}
	require.Equal(t, []guid.GUID{id}, ObservedGUIDs(&Unit{Info: unitinfo.Info{Guid: id}}, ObservationPolicy{}))
}

func TestObservedGUIDsIgnoresRemoteBuffNPCs(t *testing.T) {
	t.Parallel()
	player := guid.GUID(1)
	for _, entry := range []uint32{10719, 1938, 4949} {
		for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000, 0} {
			id := guid.GUID(high | uint64(entry)<<24 | 2)
			ignored := id.IsCreature() || id.IsVehicle()
			for _, msg := range []Message{
				&Aura{Source: &id, Target: player, SpellName: "World buff", Amount: 1},
				&Aura{Source: &player, Target: id, SpellName: "World buff", Amount: 1},
				&Damage{Caster: &id, Target: player, Amount: 5},
				&Unit{Info: unitinfo.Info{Guid: player, Owner: &id, Charm: &id}},
				&UnitClassificationEvent{Target: player, Owner: &id, Controller: &id},
				&ThreatTank{Entries: []ThreatTankEntry{{ServerGUID: id.String()}}},
				&PlayerPosition{PlayerPosition: playerposition.PlayerPosition{Guid: id.String()}},
				&Versions{Player: &id},
			} {
				before := append([]guid.GUID(nil), msg.Affects()...)
				observed := ObservedGUIDs(msg, ObservationPolicy{})
				require.Equal(t, before, append([]guid.GUID(nil), msg.Affects()...), "must not alter event participants")
				if ignored {
					require.NotContains(t, observed, id)
				} else {
					require.Contains(t, observed, id)
				}
				for _, affected := range before {
					if affected == player {
						require.Contains(t, observed, player)
					}
				}
				if aura, ok := msg.(*Aura); ok {
					require.Equal(t, "World buff", aura.SpellName)
					require.Equal(t, int32(1), aura.Amount)
					if aura.Target == player {
						require.Equal(t, id, *aura.Source)
					} else {
						require.Equal(t, player, *aura.Source)
						require.Equal(t, id, aura.Target)
					}
				}
			}
		}
	}
}

func TestObservedGUIDsForeverSleepingBag(t *testing.T) {
	t.Parallel()
	for _, policy := range []ObservationPolicy{{}, {WoWForever: true}} {
		for _, entry := range []uint32{214589, 214588, 10719, 1938, 4949} {
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				player := guid.GUID(1)
				msg := &NewOwner{Target: id, NewOwner: player}
				before := *msg
				observed := ObservedGUIDs(msg, policy)
				ignored := (entry == 10719 || entry == 1938 || entry == 4949) && (id.IsCreature() || id.IsVehicle())
				ignored = ignored || (entry == 214589 && id.IsCreature() && policy.WoWForever)
				require.Equal(t, before, *msg, "summon ownership evidence must remain intact")
				require.Contains(t, observed, player)
				if ignored {
					require.NotContains(t, observed, id)
				} else {
					require.Contains(t, observed, id)
				}
			}
		}
	}
}
