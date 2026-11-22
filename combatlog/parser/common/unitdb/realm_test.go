package unitdb

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/stretchr/testify/require"
)

type testRealmLookup map[guid.GUID]map[string]string

func (r testRealmLookup) LookupPlayerRealm(id guid.GUID, name string) (string, bool) {
	v, ok := r[id][name]
	return v, ok
}

func TestPlayerRealmAttachment(t *testing.T) {
	t.Parallel()
	id := guid.GUID(1)
	lookup := testRealmLookup{id: {}}
	units := New(nil)
	units.SetPlayerRealmLookup(lookup)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "First"})
	units.Update(unitinfo.Info{Guid: id, Name: "First"})
	require.Empty(t, units.Players[id].RawRealm)
	lookup[id]["First"] = "Normal-US"
	lookup[id]["Second"] = "Normal-EU"
	units.RefreshPlayerRealms()
	require.Equal(t, "Normal-US", units.Players[id].RawRealm)
	require.Equal(t, "Normal-US", units.Info[id].RawRealm)
	delete(lookup[id], "First")
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "First"})
	units.Update(unitinfo.Info{Guid: id, Name: "First"})
	require.Equal(t, "Normal-US", units.Players[id].RawRealm)
	require.Equal(t, "Normal-US", units.Info[id].RawRealm)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Second"})
	units.Update(unitinfo.Info{Guid: id, Name: "Second"})
	require.Equal(t, "Normal-EU", units.Players[id].RawRealm)
	require.Equal(t, "Normal-EU", units.Info[id].RawRealm)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Unknown Name"})
	units.Update(unitinfo.Info{Guid: id, Name: "Unknown Name"})
	require.Empty(t, units.Players[id].RawRealm)
	require.Empty(t, units.Info[id].RawRealm)
	units.SetPlayerRealmLookup(nil)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Second"})
	require.Empty(t, units.Players[id].RawRealm)
}

func TestPlayerIdentityAmbiguityBeforeMerge(t *testing.T) {
	t.Parallel()
	units := New(nil)
	id := guid.GUID(42)
	for _, name := range []string{"", "Unknown", "nil", "Alice"} {
		units.UpdateUnitName(id, name)
	}
	require.False(t, units.PlayerIdentityAmbiguous(id))
	// Existing names make UpdateUnitName return early, but evidence must survive.
	units.UpdateUnitName(id, "Bob")
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Alice"})
	require.True(t, units.PlayerIdentityAmbiguous(id))
	other := guid.GUID(43)
	units.Update(unitinfo.Info{Guid: other, Name: "Alice"})
	units.UpdatePlayer(combatant.Combatant{Guid: other, Name: "Bob"})
	require.True(t, units.PlayerIdentityAmbiguous(other))
}
