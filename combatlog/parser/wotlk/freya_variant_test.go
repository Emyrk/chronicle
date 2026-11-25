package wotlk

import (
	"context"
	"io"
	"log/slog"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

// Real Freya kill: two essences, but three elders casting/self-applying 62467.
// No elder damage or Ironbranch essence is needed. Keep sparse real damage
// heartbeats so this fixture preserves one activity period through surrender.
func TestFreyaRawThreeTrees(t *testing.T) {
	t.Parallel()
	file, err := os.Open("testdata/freya-trees.txt")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, file.Close()) })
	flavor := database.WoWFlavor{database.FlavorWrath}
	ctx := parsectx.With(context.Background(), parsectx.Context{Flavor: flavor})
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	db := missingSpellTestDB{}
	parser, err := New(ctx, logger, file, db, db, nil)
	require.NoError(t, err)
	inst := instances.UlduarFactory.New(ctx, logger, unitdb.New(flavor), zone.Zone{Name: "Ulduar", MapID: 603}, flavor)
	for {
		msgs, err := parser.Advance(ctx)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		for _, msg := range msgs {
			require.NoError(t, inst.Process(msg))
		}
	}
	result, err := inst.Finalize(ctx)
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	got := result.Encounters[0]
	require.Equal(t, "Freya", got.Name)
	require.Equal(t, "trees_3", got.Variant)
	require.Equal(t, encounter.KillTypeClean, got.KillType)
	require.Equal(t, "21:52:52.167", got.Combat.Start.Format("15:04:05.000"))
	require.Equal(t, "21:59:43.828", got.Combat.End.Format("15:04:05.000"))
	require.Len(t, got.Combat.Hostiles, 1)
}
