package creatures

import (
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
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
