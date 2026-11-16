package serviceriver

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/stretchr/testify/require"
)

func TestLogQueues(t *testing.T) {
	t.Parallel()
	for _, count := range []int64{0, 1, 3} {
		s := &Service{logParsingWorkers: count, logFinalizingWorkers: 2}
		queues, err := s.logQueues()
		require.NoError(t, err)
		require.Equal(t, 2, queues[chronicle.QueueLogFinalizing].MaxWorkers)
		for _, name := range []string{riverqueue.QueueLogParsing, chronicle.QueueNativeLogParsing} {
			config, exists := queues[name]
			require.Equal(t, count > 0, exists)
			if exists {
				require.Equal(t, int(count), config.MaxWorkers)
			}
		}
		for _, config := range queues {
			require.Positive(t, config.MaxWorkers)
		}
	}
	// Queue routing is independent of this process's consumer configuration.
	require.Equal(t, riverqueue.QueueLogParsing, (chronicle.ArgsLogParse{}).InsertOpts().Queue)
	require.Equal(t, chronicle.QueueNativeLogParsing, (chronicle.ArgsNativeLogParse{}).InsertOpts().Queue)
}

func TestInvalidLogQueuesFailBeforeDependencies(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		parse, finalize int64
		message         string
	}{
		{-1, 1, "CHRONICLE_LOG_PARSING_WORKERS"},
		{0, 0, "CHRONICLE_LOG_FINALIZING_WORKERS"},
		{1, -1, "CHRONICLE_LOG_FINALIZING_WORKERS"},
	} {
		s := &Service{logParsingWorkers: tc.parse, logFinalizingWorkers: tc.finalize}
		require.ErrorContains(t, s.Start(context.Background()), tc.message)
	}
}

func TestLogQueueOptions(t *testing.T) {
	t.Parallel()
	s := &Service{}
	options := s.Options()
	for _, option := range options {
		require.NoError(t, option.Value.Set(option.Default))
	}
	queues, err := s.logQueues()
	require.NoError(t, err)
	require.Len(t, queues, 3)
	require.Equal(t, 1, queues[chronicle.QueueLogFinalizing].MaxWorkers)
	found := false
	for _, option := range options {
		if option.Env == "CHRONICLE_LOG_FINALIZING_WORKERS" {
			found = true
			require.Equal(t, "log-finalize-worker-count", option.Flag)
			require.Equal(t, "1", option.Default)
			require.NoError(t, option.Value.Set("4"))
		}
		if option.Env == "CHRONICLE_LOG_PARSING_WORKERS" {
			require.Equal(t, "log-parse-worker-count", option.Flag)
			require.NoError(t, option.Value.Set("0"))
		}
	}
	require.True(t, found)
	queues, err = s.logQueues()
	require.NoError(t, err)
	require.Len(t, queues, 1)
	require.Equal(t, 4, queues[chronicle.QueueLogFinalizing].MaxWorkers)
}
