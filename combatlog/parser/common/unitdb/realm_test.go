package unitdb

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/stretchr/testify/require"
)

func TestPlayerRealmEvidenceIsolation(t *testing.T) {
	t.Parallel()
	units := New(nil)
	id := guid.GUID(1)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	observe := func(name, realm string, ts time.Time) {
		require.NoError(t, units.ProcessMessage(&messages.PlayerRealm{
			MessageBase: messages.Base(ts), Player: id, Name: name,
			Realm: combatant.RealmObservation{RawName: realm, ObservedAt: ts},
		}))
	}
	observe("Unknown", "", at)
	require.Empty(t, units.QualifiedPlayers)
	require.Empty(t, units.Players)
	observe("Original", "Normal-US", at)
	observe("Renamed", "Normal-US", at.Add(time.Second))
	observe("Stale", "Normal-US", at)
	observe("Other", "Normal-EU", at)
	observe("Alias", "CAMWOWUS1Realm1PvE", at)
	require.Len(t, units.QualifiedPlayers, 3, "aliases are raw evidence, not canonicalized")
	require.Equal(t, "Renamed", units.QualifiedPlayers[combatant.PlayerIdentity{GUID: id, Realm: "Normal-US"}].Name)
	require.Empty(t, units.Players, "metadata must not affect GUID-only compatibility state")
	require.Empty(t, units.PlayerByName)
	require.Empty(t, units.Info)
}
