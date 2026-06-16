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
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestSpectralTutor(t *testing.T) {
	t.Parallel()
	t.Skip("not sure what is going on")

	raw, err := os.OpenFile("testdata/scholotutor/WoWRawCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)
	logs, err := os.OpenFile("testdata/scholotutor/WoWCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)

	ctx := testutil.Context(t, testutil.WaitSuperLong)
	logger := testutil.Logger(t)

	m := merge.NewMerger(logger, merge.WithoutTimeAdjustments())
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
	require.Len(t, fights, 1)
	tutor, ok := fights[0].Hostiles[0xF13000290200BF40]
	require.True(t, ok)
	require.Len(t, tutor.Activity, 1)
	require.Equal(t, period.EndStateSlain, tutor.Activity[0].EndState)
}
