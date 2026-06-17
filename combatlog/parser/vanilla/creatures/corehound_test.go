package creatures_test

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/merge"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestCoreHoundDeath(t *testing.T) {
	t.Parallel()
	t.Skip("moving to v2")

	raw, err := os.OpenFile("testdata/corehoundpack/WoWRawCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)
	logs, err := os.OpenFile("testdata/corehoundpack/WoWCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)

	ctx := testutil.Context(t, testutil.WaitSuperLong)
	logger := testutil.Logger(t)

	m := merge.NewMerger(logger)
	liner, scans, err := m.LineScanner(ctx, nil, logfile.New(nil, raw), logfile.New(nil, logs))
	require.NoError(t, err)

	p := vanilla.NewFromScanner(context.Background(), logger, liner, scans, nil)
	output := encounters.New(ctx, logger, nil)
	for {
		msgs, err := p.Advance(ctx)
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)

		for _, msg := range msgs {
			err = output.Process(msg)
			require.NoError(t, err)
		}
	}

	// Analyze the results here as needed.
	fights := output.CurrentInstance.Fights()
	require.Len(t, fights, 2)
}

// Logs have a glancing blow happen after death that trigger a reactivation of the corehound:
// 0x000000000006AE9B hits 0xF130002D9700DD38 for 1. (glancing) (402 absorbed)
func TestCoreHoundDeathDamageAfter(t *testing.T) {
	t.Parallel()
	t.Skip("moving to v2")

	raw, err := os.OpenFile("testdata/corehoundpack-damageafter/WoWRawCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)
	logs, err := os.OpenFile("testdata/corehoundpack-damageafter/WoWCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)

	ctx := testutil.Context(t, testutil.WaitSuperLong)
	logger := testutil.Logger(t)

	m := merge.NewMerger(logger)
	liner, scans, err := m.LineScanner(ctx, nil, logfile.New(nil, raw), logfile.New(nil, logs))
	require.NoError(t, err)

	p := vanilla.NewFromScanner(context.Background(), logger, liner, scans, nil)
	output := encounters.New(ctx, logger, nil)
	for {
		msgs, err := p.Advance(ctx)
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)

		for _, msg := range msgs {
			err = output.Process(msg)
			require.NoError(t, err)
		}
	}

	// Analyze the results here as needed.
	fights := output.CurrentInstance.Fights()
	require.Len(t, fights, 2)

	hound, ok := fights[0].Hostiles[0xF130002D9700DD38]
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, hound.Activity[0].EndState, "hound should be dead")

	// The corehound leaks into the Lucifron fight, but it should be killed in the first fight
	_, ok = fights[1].Hostiles[0xF130002D9700DD38]
	require.False(t, ok, "hound should not be reactivated")
}
