package wotlk

import (
	"io"
	"log/slog"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/stretchr/testify/require"
)

// The fixture's swing and death records derive from Lord Marrowgar in
// combatlog-cfbe27f4-5559-4f06-9aa2-5e41dbb2a4f7 (1).txt. Names and GUID low
// bits are scrubbed; records are repeated and retimed for four short fights.
// Companion zone records are injected synthetic metadata, not observations
// from that log. This exercises transport and snapshots, not hard-mode detection.
func TestDifficultyTransitionsThroughWrathWire(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	file, err := os.Open("testdata/difficulty_transitions.txt")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, file.Close()) })
	parser, err := New(ctx, logger, file, auraTestDB{}, auraTestDB{}, nil)
	require.NoError(t, err)
	state := encounters.NewWithInstanceResolver(ctx, logger, func(_ bool, z zone.Zone, db *unitdb.Units) *instances.Hookable {
		hostiles := map[uint32]instances.Identity{}
		instances.LoadBosses(hostiles, map[uint32]string{36612: "Lord Marrowgar"})
		return instances.NewHookable(ctx, logger, db, z, instances.InstanceParams{
			Name: "Icecrown Citadel", Idf: identifier.NewIdentifier(hostiles),
			MatchesZone: func(other zone.Zone) bool { return other.Name == "icecrown citadel" },
		})
	})
	zones, deaths := 0, 0
	var first *instances.Hookable
	for {
		msgs, err := parser.Advance(ctx)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		for _, msg := range msgs {
			require.NoError(t, state.Process(msg))
			switch msg.(type) {
			case *messages.Zone:
				zones++
				if zones == 1 {
					first = state.CurrentInstance
				}
				if zones <= 3 {
					require.Len(t, state.Instances, 1)
					require.Same(t, first, state.CurrentInstance)
				} else {
					require.Len(t, state.Instances, 2)
					require.NotSame(t, first, state.CurrentInstance)
					require.Equal(t, 10, state.CurrentInstance.CurrentZone.MaxPlayers)
				}
				if zones == 2 || zones == 3 {
					require.True(t, first.FightActive(), "mode update %d must occur mid-fight", zones)
				}
			case *messages.Slain:
				deaths++
				if deaths <= 3 {
					require.Len(t, first.Fights(), deaths)
					require.Equal(t, []string{"", "heroic", ""}[deaths-1], first.Fights()[deaths-1].Difficulty)
				}
			}
		}
	}
	require.Equal(t, 4, zones)
	require.Equal(t, 4, deaths)
	require.Len(t, state.Instances, 2)
	require.Equal(t, 25, first.CurrentZone.MaxPlayers)
	require.Len(t, state.CurrentInstance.Fights(), 1)
	require.Empty(t, state.CurrentInstance.Fights()[0].Difficulty)
}
