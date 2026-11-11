package parserv2

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/stretchr/testify/require"
)

func TestNextPureRecordsParity(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("../../../parsernext/vanilla/testdata/capybara-records.log")
	require.NoError(t, err)
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	goLine := "1|SPELL_GO|0|123|0x0000000000000001|0x0000000000000002|0|1|0"
	start := "1|SPELL_START|1|123|0x0000000000000001|0x0000000000000002|0|1000|2000|1"
	energize := "1|ENERGIZE|0x0000000000000001|nil|123|0|-42|1"
	auraCast := "1|AURA_CAST|123|0x0000000000000001|nil|6|3|0|0|1000|2"
	lines = append(lines, goLine, start, energize, auraCast, "1|DISPEL|0x0000000000000001|0x0000000000000002|123")
	for _, suffix := range []string{"|", "|nil", "|0x0000000000000000", "|0x0000000000000003", "|bad"} {
		lines = append(lines, goLine+suffix)
	}
	for _, optional := range []string{"", "nil", "0x0000000000000000", "bad"} {
		lines = append(lines, strings.Replace(start, "0x0000000000000002", optional, 1))
	}
	for _, event := range []string{"BUFF_ADD", "BUFF_REM", "DEBUFF_ADD", "DEBUFF_REM"} {
		for _, state := range []string{"0", "1", "2", "3"} {
			lines = append(lines, "1|"+event+"|0x0000000000000001|ignored|123|2|ignored|ignored|"+state)
		}
	}
	for _, amount := range []string{"0", "42", "-2147483648"} {
		lines = append(lines, strings.Replace(energize, "-42", amount, 1))
	}
	for _, line := range append([]string(nil), lines...) {
		fields := strings.Split(line, "|")
		for i := 2; i < len(fields); i++ {
			lines = append(lines, strings.Join(fields[:i], "|"))
			bad := append([]string(nil), fields...)
			bad[i] = "bad"
			lines = append(lines, strings.Join(bad, "|"))
		}
	}
	for _, db := range []gamedb.GameDB{combatSpellLookup{}, &stubGameDB{}, combatSpellLookup{err: errors.New("lookup failed")}} {
		for _, line := range lines {
			require.True(t, assertRecordParity(t, db, line))
		}
	}
}

func TestNextPurePayloads(t *testing.T) {
	t.Parallel()
	db := &stubGameDB{}
	batch, err := next.DecodeRecord(t.Context(), db, "1|ENERGIZE|0x0000000000000001|nil|0|0|-42|1")
	require.NoError(t, err)
	resource := batch[0].(*messages.ResourceChange)
	require.Nil(t, resource.Caster)
	require.Nil(t, resource.SpellData)
	require.EqualValues(t, 42, resource.Amount)
	require.Equal(t, types.ChangeDirectionLoss, resource.Direction)
	batch, err = next.DecodeRecord(t.Context(), db, "1|BUFF_REM|0x0000000000000001|unused|0|2|unused|unused|2")
	require.NoError(t, err)
	aura := batch[0].(*messages.Aura)
	require.True(t, aura.IsBuff)
	require.Equal(t, types.AuraStateRemoved, aura.State)
	require.EqualValues(t, 2, aura.Amount)
	batch, err = next.DecodeRecord(t.Context(), db, "1|SPELL_GO|0|0|0x0000000000000001|nil|0|1|0|0x0000000000000003")
	require.NoError(t, err)
	cast := batch[0].(*messages.SpellGo)
	require.Nil(t, cast.ItemID)
	require.Nil(t, cast.Target)
	require.EqualValues(t, 3, *cast.CorpseOwner)
}
