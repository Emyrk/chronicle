package cli

import (
	"errors"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestRegisterResyncScoreWorker(t *testing.T) {
	t.Parallel()

	workers := river.NewWorkers()
	worker := registerResyncScoreWorker(workers, nil, slog.Default())
	require.NotNil(t, worker)

	err := river.AddWorkerSafely(workers, &servicerankings.WorkerComputeParseScores{})
	require.ErrorContains(t, err, `worker for kind "compute-parse-scores" is already registered`)
}

func TestResyncAuthzInitErrorIncludesRailwayPortForwardHelp(t *testing.T) {
	t.Parallel()

	cause := errors.New("connection refused")
	err := resyncAuthzInitError(cause)

	require.ErrorIs(t, err, cause)
	require.ErrorContains(t, err, "railway ssh --service spicedb -- -N")
	require.ErrorContains(t, err, "-L 127.0.0.1:50052:127.0.0.1:50051")
	require.ErrorContains(t, err, "CHRONICLE_SPICEDB_GRPC_URL=127.0.0.1:50052")
	require.ErrorContains(t, err, "CHRONICLE_SPICEDB_PRESHARED_KEY=<production-preshared-key>")
}
