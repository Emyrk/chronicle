package modern

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestPlayerRealmName(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, realm, display string }{
		{"Mostly-Harmless-Normal-EU", "Normal-EU", "Mostly Harmless"},
		{"First-Last-Roleplay-US", "Roleplay-US", "First Last"},
		{"Tester-ClassicBetaPvE-", "ClassicBetaPvE", "Tester"},
		{"Player-CAMWOWUS1Realm1PvE", "CAMWOWUS1Realm1PvE", "Player"},
		{"Player", "", "Player"}, {"Player-", "", "Player"},
		{"", "", ""}, {"Player--US", "", "Player"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.realm, playerRealmName(tc.name))
			require.Equal(t, tc.display, stripRealm(tc.name))
		})
	}
}

func TestRealmQualifiedPlayersFromCombatNames(t *testing.T) {
	t.Parallel()
	input := `10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18
10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-US",0x518,0x80000000,Player-4618-00C7EC79,"Other-Name-Normal-EU",0x518,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:02.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"Renamed-Player-Normal-US",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:03.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"Unqualified",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:04.000  COMBATANT_INFO,Player-4618-00C7EC79,0,69,41,123,41,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1826,1486,[(105638,130362,3)],(0,0,0,0),[(250532,25,(),(),())],[],1,0,0,0`
	p, err := New(context.Background(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	units := unitdb.New(nil)
	var observations []*messages.PlayerRealm
	var realCombatants int
	for {
		batch, err := p.Advance(context.Background())
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		for _, msg := range batch {
			require.NoError(t, units.ProcessMessage(msg))
			if c, ok := msg.(*messages.Combatant); ok && len(c.GearSetups) > 0 {
				realCombatants++
				require.Empty(t, c.Realm.RawName, "GUID-only record must remain unqualified")
			}
			if realm, ok := msg.(*messages.PlayerRealm); ok {
				observations = append(observations, realm)
				require.Empty(t, realm.Affects(), "metadata must not create membership")
			}
		}
	}
	require.Len(t, observations, 3)
	require.Equal(t, 1, realCombatants)
	id, err := guid.FromString("0x0000120A00C7EC79")
	require.NoError(t, err)
	require.Len(t, units.QualifiedPlayers, 2)
	us := combatant.PlayerIdentity{GUID: id, Realm: "Normal-US"}
	eu := combatant.PlayerIdentity{GUID: id, Realm: "Normal-EU"}
	require.Equal(t, "Renamed Player", units.QualifiedPlayers[us].Name)
	require.Equal(t, "Other Name", units.QualifiedPlayers[eu].Name)
	require.Equal(t, time.Date(2026, 10, 7, 22, 0, 2, 0, time.UTC), units.QualifiedPlayers[us].Realm.ObservedAt)
	require.Equal(t, time.Date(2026, 10, 7, 22, 0, 1, 0, time.UTC), units.QualifiedPlayers[eu].Realm.ObservedAt)
	// GUID-only COMBATANT_INFO cannot be assigned even after observing names.
	unqualified := combatant.Combatant{Guid: id, Name: "Cached Name", Seen: observations[2].Date(), GearSetups: []combatant.GearItem{{}}}
	units.UpdatePlayer(unqualified)
	require.Empty(t, units.QualifiedPlayers[us].GearSetups)
	require.Empty(t, units.QualifiedPlayers[eu].GearSetups)
	require.Equal(t, "Cached Name", units.Players[id].Name)
	require.Empty(t, units.Players[id].Realm.RawName)
}

func TestLegacyTransformDoesNotInventRealm(t *testing.T) {
	t.Parallel()
	r := newTransformReader(strings.NewReader(""))
	_, err := r.transform(`10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1`)
	require.NoError(t, err)
	converted, err := r.transform(`10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"Player-Realm",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20`)
	require.NoError(t, err)
	require.NotContains(t, converted, "BLIZZARD_PLAYER_REALM")
	require.Contains(t, converted, `"Player-Realm"`)
}
