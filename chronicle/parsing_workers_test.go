package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestRegisterParsingWorkersQueueConsumption(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitShort)
	chron := &Chronicle{}

	serverQueues, err := riverqueue.New(ctx, riverqueue.Options{})
	require.NoError(t, err)
	chron.RegisterParsingWorkers(serverQueues, 0)
	require.False(t, serverQueues.ConsumesQueue(riverqueue.QueueLogParsing))

	parserQueues, err := riverqueue.New(ctx, riverqueue.Options{})
	require.NoError(t, err)
	chron.RegisterParsingWorkers(parserQueues, 4)
	require.True(t, parserQueues.ConsumesQueue(riverqueue.QueueLogParsing))
}
