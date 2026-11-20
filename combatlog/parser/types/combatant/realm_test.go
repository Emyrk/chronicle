package combatant

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestRealmQualifiedMerge(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	existing := Combatant{Guid: guid.GUID(1), Name: "Existing", Realm: RealmObservation{RawName: "Normal-US", ObservedAt: at}, GearSetups: []GearItem{{}}}
	for _, tc := range []struct {
		name, realm string
		merge       bool
	}{
		{"same", "Normal-US", true}, {"different", "Normal-EU", false},
		{"missing", "", false}, {"unresolved alias", "CAMWOWUS1Realm1PvE", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			incoming := Combatant{Guid: existing.Guid, Realm: RealmObservation{RawName: tc.realm}}
			incoming.MergeExisting(existing)
			if tc.merge {
				require.Equal(t, existing, incoming)
			} else {
				require.Empty(t, incoming.Name)
				require.Empty(t, incoming.GearSetups)
				require.Equal(t, tc.realm, incoming.Realm.RawName)
			}
		})
	}
	legacy := Combatant{Guid: existing.Guid, Name: "Legacy", GearSetups: existing.GearSetups}
	incoming := Combatant{Guid: existing.Guid}
	incoming.MergeExisting(legacy)
	require.Equal(t, legacy, incoming, "legacy single-realm merging is unchanged")
	newer := Combatant{Guid: existing.Guid, Name: "Renamed", Realm: RealmObservation{RawName: "Normal-US", ObservedAt: at.Add(time.Second)}}
	newer.MergeExisting(existing)
	require.Equal(t, "Renamed", newer.Name)
	require.Equal(t, at.Add(time.Second), newer.Realm.ObservedAt)
	require.Equal(t, existing.GearSetups, newer.GearSetups)
}
