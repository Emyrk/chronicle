package parsernext_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/forever"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
	"github.com/Emyrk/chronicle/combatlog/parsernext/tbc"
	"github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parsernext/wotlk"
	"github.com/stretchr/testify/require"
)

type unreadable struct{}

func (unreadable) Read([]byte) (int, error) { panic("unsupported selection read input") }

func TestSelectionMatrix(t *testing.T) {
	t.Parallel()
	accepted := map[parsernext.Selection]bool{
		{Format: formats.VanillaCompanion, Expansion: vanilla.Name}: true,
		{Format: formats.TBCCompanion, Expansion: tbc.Name}:         true,
		{Format: formats.WrathCompanion, Expansion: wotlk.Name}:     true,
		{Format: formats.AzerothCore, Expansion: wotlk.Name}:        true,
		{Format: formats.CLEUv22, Expansion: forever.Name}:          true,
	}
	for _, expansion := range []common.Expansion{vanilla.Name, tbc.Name, wotlk.Name, forever.Name, "", "unknown"} {
		for _, format := range []formats.ID{formats.VanillaCompanion, formats.TBCCompanion, formats.WrathCompanion, formats.AzerothCore, "v9-cleu", formats.CLEUv22, "", "unknown", "hermesproxy_1_14_2_cc", "1.12a-superwow-addon"} {
			selection := parsernext.Selection{Format: format, Expansion: expansion}
			t.Run(fmt.Sprintf("%s/%s", expansion, format), func(t *testing.T) {
				t.Parallel()
				if !accepted[selection] {
					got, err := parsernext.ReadFile(t.Context(), selection, unreadable{}, 128, func(common.Line) error { t.Fatal("unsupported route visited line"); return nil })
					require.ErrorIs(t, err, parsernext.ErrUnsupportedSelection)
					require.Zero(t, got)
					return
				}
				var seen []common.Line
				got, err := parsernext.ReadFile(t.Context(), selection, strings.NewReader("physical source only\n"), 128, func(line common.Line) error { seen = append(seen, line); return nil })
				require.NoError(t, err)
				require.EqualValues(t, 1, got.Lines)
				require.Equal(t, "physical source only\n", seen[0].Raw)
			})
		}
	}
}
