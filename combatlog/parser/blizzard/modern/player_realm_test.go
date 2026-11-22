package modern

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
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

func TestParserPlayerRealmIndex(t *testing.T) {
	t.Parallel()
	input := `10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18
10/7/2026 22:00:02.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-US",0x518,0x80000000,Player-4618-00C7EC79,"Other-Name-Normal-EU",0x518,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-EU",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:03.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First Last",0x518,0x80000000,Player-4618-00C7EC79,"Missing",0x518,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:04.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-US",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20`
	p, err := New(context.Background(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	for {
		_, err := p.Advance(context.Background())
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
	}
	id, err := guid.FromString("0x0000120A00C7EC79")
	require.NoError(t, err)
	require.Equal(t, map[guid.GUID]map[string]PlayerRealmInfo{
		id: {"First Last": {RawRealm: "Normal-US"}, "Other Name": {RawRealm: "Normal-EU"}},
	}, p.playerRealms)
	require.ElementsMatch(t, []string{"First Last", "Other Name", "Missing"}, p.ObservedPlayerNames(id))
	units := unitdb.New(nil)
	units.SetPlayerRealmLookup(p)
	require.True(t, units.PlayerIdentityAmbiguous(id))
}

func TestNormalizeUnitNameRealmIndex(t *testing.T) {
	t.Parallel()
	r := newTransformReader(strings.NewReader(""))
	r.combatLogVersion = 22
	r.playerRealms = make(map[guid.GUID]map[string]PlayerRealmInfo)
	raw := "Player-4618-00C7EC79"
	_, err := r.guids.normalize(raw)
	require.NoError(t, err)
	for _, name := range []string{`nil`, `"Missing"`, `"Missing-"`, `"Bad--US"`, `""`, `not-quoted`} {
		r.normalizeUnitName(raw, name)
	}
	require.Empty(t, r.playerRealms)
	require.Equal(t, `"First Last"`, r.normalizeUnitName(raw, `"First-Last-Normal-US"`))
	for i := 0; i < 100; i++ {
		require.Equal(t, `"First Last"`, r.normalizeUnitName(raw, `"First-Last-Normal-US"`))
	}
	id := guid.GUID(r.guids.rawToValue[raw])
	require.Len(t, r.playerRealms, 1)
	require.Len(t, r.playerRealms[id], 1)
	require.Equal(t, PlayerRealmInfo{RawRealm: "Normal-US"}, r.playerRealms[id]["First Last"])
	// Unknown realm cannot erase known evidence; later conflicting realm cannot replace it.
	r.normalizeUnitName(raw, `"First Last"`)
	r.normalizeUnitName(raw, `"First-Last-Roleplay-EU"`)
	require.Equal(t, PlayerRealmInfo{RawRealm: "Normal-US"}, r.playerRealms[id]["First Last"])
}

func TestLegacyTransformDoesNotCaptureRealm(t *testing.T) {
	t.Parallel()
	r := newTransformReader(strings.NewReader(""))
	r.combatLogVersion = 9
	converted, err := r.transform(`10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"Player-Realm",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20`)
	require.NoError(t, err)
	require.Contains(t, converted, `"Player-Realm"`)
	require.Empty(t, r.playerRealms)
}

func TestAbsorbPlayerRealmIndex(t *testing.T) {
	t.Parallel()
	r := newTransformReader(strings.NewReader(""))
	r.combatLogVersion = 22
	r.playerRealms = make(map[guid.GUID]map[string]PlayerRealmInfo)
	converted, err := r.transform(`9/23/2026 11:12:27.557-4  SPELL_ABSORBED,Creature-0-4615-0-10340-267006-0000B3EC43,"Dark Neophyte",0xa28,0x80000000,Player-4620-00D5496D,"Target-Normal-US",0x518,0x80000000,Player-4620-00D5496D,"Caster-Normal-EU",0x518,0x80000000,1310927,"Light's Fury",0x2,4,16,nil`)
	require.NoError(t, err)
	require.Contains(t, converted, "BLIZZARD_SPELL_ABSORBED")
	id := guid.GUID(r.guids.rawToValue["Player-4620-00D5496D"])
	require.Equal(t, map[string]PlayerRealmInfo{"Target": {RawRealm: "Normal-US"}, "Caster": {RawRealm: "Normal-EU"}}, r.playerRealms[id])
}

func TestRealmIndexDisabledOutsideForever(t *testing.T) {
	t.Parallel()
	for _, r := range []*transformReader{
		newHermesProxyTransformReader(strings.NewReader("")),
		newTransformReader(strings.NewReader("")),
	} {
		require.Nil(t, r.playerRealms)
		// A v22-looking name cannot enable an index in a reader not opted in by New.
		r.combatLogVersion = 22
		raw := "Player-4618-00C7EC79"
		_, err := r.guids.normalize(raw)
		require.NoError(t, err)
		require.Equal(t, `"Player"`, r.normalizeUnitName(raw, `"Player-Normal-US"`))
		require.Nil(t, r.playerRealms)
	}
	const header = "10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1"
	p, err := New(context.Background(), slog.Default(), strings.NewReader(header), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV9Cleu)
	require.NoError(t, err)
	require.Nil(t, p.playerRealms)
	_, err = p.Advance(context.Background())
	require.NoError(t, err)
	require.Nil(t, p.playerRealms)
	p, err = NewHermesProxy(context.Background(), slog.Default(), strings.NewReader("10/7 22:00:00.000  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1"), hermesProxyTestDB{}, hermesProxyTestDB{}, nil)
	require.NoError(t, err)
	require.Nil(t, p.playerRealms)
	_, err = p.Advance(context.Background())
	require.NoError(t, err)
	require.Nil(t, p.playerRealms)
}

func TestParserRealmLookupEnrichesUnitDB(t *testing.T) {
	t.Parallel()
	input := `10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1
10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-US",0x518,0x80000000,Player-4618-00C7EC79,"Other-Name-Normal-EU",0x518,0x80000000,686,"Shadow Bolt",0x20`
	p, err := New(context.Background(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	units := unitdb.New(nil)
	units.SetPlayerRealmLookup(p)
	id := guid.GUID(0x0000120A00C7EC79)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "First Last"})
	units.Update(unitinfo.Info{Guid: id, Name: "Other Name"})
	require.Empty(t, units.Players[id].RawRealm)
	for {
		_, err := p.Advance(context.Background())
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
	}
	units.RefreshPlayerRealms()
	require.Equal(t, "Normal-US", units.Players[id].RawRealm)
	require.Equal(t, "Normal-EU", units.Info[id].RawRealm)
	_, ok := p.LookupPlayerRealm(id, "Missing Name")
	require.False(t, ok)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Missing Name"})
	require.Empty(t, units.Players[id].RawRealm)
}
