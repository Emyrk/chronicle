package creatures

import (
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestUnknownReportSkipsMissingEntry(t *testing.T) {
	t.Parallel()
	c := New(slog.Default(), database.WoWFlavor{})
	for _, id := range []guid.GUID{0x30930149A4DF0002, 0x32DC014A20DF0002, 0xF130000000000001, 0xF130000844003FB5} {
		msg := &messages.UnitTarget{Unit: id}
		require.NoError(t, c.Process(msg))
		require.Equal(t, id, msg.Unit)
	}
	require.Equal(t, map[uint32]int{0x844: 1}, c.UnknownUnits[""])
}

func TestSleepingBagObservationIsForeverCreatureOnly(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{nil, {database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorWoWForever}, {database.FlavorTurtle}, {database.FlavorWrath}} {
		c := New(slog.Default(), flavor)
		for _, entry := range []uint32{214589, 8996, 10719, 1938, 4949} {
			id := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
			msg := &messages.NewOwner{Target: id, NewOwner: 1}
			before := *msg
			require.NoError(t, c.Process(msg))
			require.Equal(t, before, *msg)
			require.NoError(t, c.Process(&messages.Unit{Info: unitinfo.Info{Guid: id, Name: "Observed unit"}}))
			_, known := c.Units.Get(id)
			require.True(t, known, "filtering observations must not discard unit evidence")
			ignored := entry == 10719 || entry == 1938 || entry == 4949 || (entry == 214589 && flavor.Has(database.FlavorWoWForever))
			if ignored {
				require.NotContains(t, c.UnknownUnits[""], entry)
				require.NotContains(t, c.ZonedUnits[""], entry)
				require.NotContains(t, c.UnitQuantity, entry)
			} else {
				require.Equal(t, 1, c.UnknownUnits[""][entry])
				require.Contains(t, c.ZonedUnits[""], entry)
				require.Contains(t, c.UnitQuantity[entry], id)
			}
		}
	}
}
