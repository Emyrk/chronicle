package parsernext_test

import (
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/database"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parsernext"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/forever"
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
		{Format: database.LogFormat335aCcAddon, Expansion: tbc.Name}:      true,
		{Format: database.LogFormat112aCcAddon, Expansion: vanilla.Name}:  true,
		{Format: database.LogFormat243CcAddon, Expansion: tbc.Name}:       true,
		{Format: database.LogFormat335aCcAddon, Expansion: wotlk.Name}:    true,
		{Format: database.LogFormatAzerothcoreMod, Expansion: wotlk.Name}: true,
		{Format: database.LogFormatV22Cleu, Expansion: forever.Name}:      true,
	}
	for _, expansion := range []common.Expansion{vanilla.Name, tbc.Name, wotlk.Name, forever.Name, "", "unknown"} {
		for _, format := range append(database.AllLogFormatValues(), "", "unknown") {
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

func TestCanonicalFormatNamesRemainCompatible(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		format database.LogFormat
		wire   string
	}{
		{database.LogFormat112aCcAddon, "1.12a-cc-addon"},
		{database.LogFormat243CcAddon, "2.4.3-cc-addon"},
		{database.LogFormat335aCcAddon, "3.3.5a-cc-addon"},
		{database.LogFormatAzerothcoreMod, "azerothcore-mod"},
		{database.LogFormatV22Cleu, "v22-cleu"},
	} {
		encoded, err := json.Marshal(tc.format)
		require.NoError(t, err)
		require.JSONEq(t, fmt.Sprintf("%q", tc.wire), string(encoded))
		var decoded database.LogFormat
		require.NoError(t, json.Unmarshal([]byte(fmt.Sprintf("%q", tc.wire)), &decoded))
		require.Equal(t, tc.format, decoded)
	}
}
