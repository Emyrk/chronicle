package companion

import (
	"bytes"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/stretchr/testify/require"
)

func TestStateDetachesAllPlayerFields(t *testing.T) {
	t.Parallel()
	p := New(slog.Default())
	p.players[1] = &PlayerData{GUID: 1, Guild: &combatant.Guild{Name: "guild"},
		Gear:    []combatant.GearItem{{EnchantID: ptr.Ref(2), TempEnchantID: ptr.Ref(3), TransmogID: ptr.Ref(4), BonusIDs: []int{5}, Gems: []combatant.GearGem{{ItemID: 6}}}},
		Talents: &combatant.Talents{Trees: [3][]uint8{{7}}}, Glyphs: &combatant.Glyphs{Groups: []combatant.GlyphGroup{{Major: [3]int{8}}}}, PetGUID: ptr.Ref(guid.GUID(9))}
	_, err := p.Feed(time.Time{}, "[4P0x0000000000000001;IPlay")
	require.NoError(t, err)
	state, err := p.CaptureState()
	require.NoError(t, err)
	restored, err := state.Restore()
	require.NoError(t, err)
	mutate := func(pd *PlayerData) {
		pd.Guild.Name = "changed"
		*pd.Gear[0].EnchantID = 20
		*pd.Gear[0].TempEnchantID = 30
		*pd.Gear[0].TransmogID = 40
		pd.Gear[0].BonusIDs[0] = 50
		pd.Gear[0].Gems[0].ItemID = 60
		pd.Talents.Trees[0][0] = 70
		pd.Glyphs.Groups[0].Major[0] = 80
		*pd.PetGUID = 90
	}
	mutate(p.players[1])
	mutate(state.Players[1])
	pd := restored.players[1]
	require.Equal(t, "guild", pd.Guild.Name)
	require.Equal(t, 2, *pd.Gear[0].EnchantID)
	require.Equal(t, 3, *pd.Gear[0].TempEnchantID)
	require.Equal(t, 4, *pd.Gear[0].TransmogID)
	require.Equal(t, 5, pd.Gear[0].BonusIDs[0])
	require.Equal(t, 6, pd.Gear[0].Gems[0].ItemID)
	require.Equal(t, uint8(7), pd.Talents.Trees[0][0])
	require.Equal(t, 8, pd.Glyphs.Groups[0].Major[0])
	require.Equal(t, guid.GUID(9), *pd.PetGUID)
	restored.WireRuntime(slog.Default())
	messages, err := restored.Feed(time.Time{}, "~er,WARRIOR,HUMAN,2,80]")
	require.NoError(t, err)
	require.Len(t, messages, 1)
	require.Equal(t, "Player", restored.players[1].Name)
	require.Equal(t, uint64(1), restored.decodedOrdinal)
}

func TestCompanionStrictStateShape(t *testing.T) {
	t.Parallel()
	state, err := New(slog.Default()).CaptureState()
	require.NoError(t, err)
	payload, err := state.Encode()
	require.NoError(t, err)
	for _, bad := range [][]byte{
		bytes.Replace(payload, []byte(`"Counter":0,`), nil, 1),
		bytes.Replace(payload, []byte(`"Counter":0`), []byte(`"Counter":0,"Counter":0`), 1),
	} {
		_, err := DecodeState(StateVersion, bad)
		require.Error(t, err)
	}
}
