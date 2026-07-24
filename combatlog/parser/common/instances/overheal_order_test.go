package instances

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

// TestOverhealingHookRunsBeforeTrackers pins the hook registration order for
// 1.12 formats: the Overhealing hook derives msg.Overheal from health
// deficits, and the DPS tracker subtracts Overheal to accumulate effective
// healing. Hooks execute in slice order, so Overhealing must come first —
// otherwise the tracker silently records total healing (regression: healing
// parses were computed from total healing instead of effective + absorbs).
func TestOverhealingHookRunsBeforeTrackers(t *testing.T) {
	t.Parallel()

	for _, format := range []database.LogFormat{
		database.LogFormat112aCcAddon,
		database.LogFormat112aSuperwowAddon,
	} {
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()

			ctx := parsectx.With(context.Background(), parsectx.Context{Format: format})
			db := unitdb.New()
			h := NewHookable(ctx, slog.Default(), db, zone.Zone{Name: "molten core"}, InstanceParams{
				Name:     "Molten Core",
				Rankings: &rankings.Rankings{},
			})

			overhealIdx, trackerIdx := -1, -1
			for i, hook := range h.hooks {
				switch hook.(type) {
				case *Overhealing:
					overhealIdx = i
				case *rankings.DPSTracker:
					trackerIdx = i
				}
			}
			require.NotEqual(t, -1, overhealIdx, "Overhealing hook must be registered for 1.12 formats")
			require.NotEqual(t, -1, trackerIdx, "DPS tracker must be registered when Rankings are set")
			require.Less(t, overhealIdx, trackerIdx,
				"Overhealing must run before the DPS tracker so effective healing sees msg.Overheal")
		})
	}
}
