package scouting

import (
	"fmt"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/forever/events"
	"github.com/Emyrk/chronicle/internal/luadata"
	"github.com/stretchr/testify/require"
)

func collection(t *testing.T, player string) luadata.Value {
	t.Helper()
	v, err := luadata.ParseTable(t.Context(), `{Version=1,Players={["Player-7-000000AB"]={`+player+`}}}`)
	require.NoError(t, err)
	return v
}

func TestTimeline(t *testing.T) {
	t.Parallel()
	v := collection(t, `Name="Alice",LastSeen=100,At={10,20,20,30,40},Levels={60,"_",61,false,"_"},Guilds={"Guild","_","",false,"_"},Party={true,"_",false,"_","_"}`)
	players, err := DecodeCollection(v)
	require.NoError(t, err)
	p := players["Player-7-000000AB"]
	_, ok := p.Lookup(9)
	require.False(t, ok)
	before := p.KnownAt(9)
	require.Nil(t, before.Name)
	row, ok := p.Lookup(19)
	require.True(t, ok)
	require.Equal(t, 10, int(row.At))
	require.Equal(t, 60, *row.Level)
	row, ok = p.Lookup(20)
	require.True(t, ok)
	require.Equal(t, 61, *row.Level)
	require.Equal(t, "", *row.Guild)
	require.False(t, *row.Party)
	require.Nil(t, row.Race)
	require.Nil(t, row.Gender)
	row, _ = p.Lookup(100)
	require.Equal(t, int64(40), row.At)
	require.Nil(t, row.Level)
	require.Nil(t, row.Guild)
	known := p.KnownAt(100)
	require.Equal(t, int64(20), known.Level.At)
	require.Equal(t, 61, *known.Level.Level)
	require.Equal(t, int64(20), known.Guild.At)
	require.Equal(t, "", *known.Guild.Guild)
	require.Equal(t, int64(40), known.Party.At)
	require.False(t, *known.Party.Party)
	require.Equal(t, int64(40), known.Name.At)
	// Delta rows are retained, including their newer freshness timestamps.
	require.Equal(t, 60, *p.Observations[1].Level)
	require.Equal(t, int64(20), p.Observations[1].At)
	require.Equal(t, int64(100), p.LastSeen)
}

func TestIndependentSources(t *testing.T) {
	t.Parallel()
	makeSource := func(body string) events.Source {
		return events.Source{Account: "same", Path: "same", Collections: luadata.Value{Kind: luadata.Table, Fields: map[string]luadata.Value{"scouting": collection(t, body)}}}
	}
	first := makeSource(`Name="A",LastSeen=10,At={10},Levels={60},Guilds={"X"},Party={true}`)
	second := makeSource(`Name="A",LastSeen=20,At={20},Levels={false},Guilds={false},Party={false}`)
	decoded, err := Decode(&events.Artifact{Sources: []events.Source{first, second}})
	require.NoError(t, err)
	require.Len(t, decoded, 2)
	require.Equal(t, 1, decoded[1].Index)
	row := decoded[1].Players["Player-7-000000AB"].Observations[0]
	require.Nil(t, row.Level)
	require.Nil(t, row.Guild)
	require.False(t, *row.Party)
	second = makeSource(`Name="A",LastSeen=20,At={20},Levels={"_"},Guilds={"_"},Party={"_"}`)
	_, err = Decode(&events.Artifact{Sources: []events.Source{first, second}})
	require.Error(t, err)
}

func TestMalformed(t *testing.T) {
	t.Parallel()
	base := `Name="A",LastSeen=20,At={10,20},Levels={60,"_"},Guilds={"X","_"},Party={true,false}`
	for _, tc := range []struct{ old, new string }{
		{`At={10,20}`, `At={20,10}`}, {`At={10,20}`, `At={10,"_"}`},
		{`At={10,20}`, `At={10,1.5}`}, {`Levels={60,"_"}`, `Levels={60}`},
		{`Levels={60,"_"}`, `Levels={"_",60}`}, {`Levels={60,"_"}`, `Levels={true,60}`},
		{`Guilds={"X","_"}`, `Guilds={true,"_"}`}, {`Party={true,false}`, `Party={false,nil}`},
		{`At={10,20}`, `At={[1]=10,[3]=20}`}, {`At={10,20}`, `At={10,[1]=20}`},
		{`Name="A"`, `Name=false`}, {`LastSeen=20`, `LastSeen="20"`},
	} {
		t.Run(tc.new, func(t *testing.T) {
			t.Parallel()
			_, err := DecodeCollection(collection(t, strings.Replace(base, tc.old, tc.new, 1)))
			require.Error(t, err)
		})
	}
}

func TestThousandPlayers(t *testing.T) {
	t.Parallel()
	var b strings.Builder
	b.WriteString(`{Version=1,Players={`)
	for i := 1; i <= 1000; i++ {
		fmt.Fprintf(&b, `["Player-7-%08X"]={Name="P%d",LastSeen=20,At={[1]=10,[2]=20},Levels={60,"_"},Guilds={"","_"},Party={false,"_"}},`, i, i)
	}
	b.WriteString(`}}`)
	v, err := luadata.ParseTable(t.Context(), b.String())
	require.NoError(t, err)
	players, err := DecodeCollection(v)
	require.NoError(t, err)
	require.Len(t, players, 1000)
	for i := 1; i <= 1000; i++ {
		p := players[fmt.Sprintf("Player-7-%08X", i)]
		require.Len(t, p.Observations, 2)
		known := p.KnownAt(20)
		require.Equal(t, int64(20), known.Level.At)
		require.Equal(t, 60, *known.Level.Level)
	}
}

func TestNormalizeGUID(t *testing.T) {
	t.Parallel()
	for raw, want := range map[string]uint64{"Player-7-000000AB": 7<<32 | 0xAB, "Player-65535-FFFFFFFF": 0x0000FFFFFFFFFFFF, "0x00000000000000AB": 0xAB} {
		got, err := NormalizeGUID(raw)
		require.NoError(t, err)
		require.Equal(t, want, uint64(got))
		require.True(t, got.IsPlayer())
	}
	for _, raw := range []string{"Player-65536-00000001", "Player-7-100000000", "Player-7-nope", "Creature-7-00000001", "0xF130000000000001", "0x0000000000000000", "bad"} {
		_, err := NormalizeGUID(raw)
		require.Error(t, err)
	}
}

func TestCollectionBoundaries(t *testing.T) {
	t.Parallel()
	for _, text := range []string{`{Version=2,Players={}}`, `{Version=1,Players={false}}`, `{Version=1,Players={["bad"]={}}}`} {
		v, err := luadata.ParseTable(t.Context(), text)
		require.NoError(t, err)
		_, err = DecodeCollection(v)
		require.Error(t, err)
	}
	sources, err := Decode(&events.Artifact{Sources: []events.Source{{Collections: luadata.Value{Kind: luadata.Table}}}})
	require.NoError(t, err)
	require.Empty(t, sources[0].Players)
	_, err = Decode(nil)
	require.Error(t, err)
}
