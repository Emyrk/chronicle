package chronicle

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestNativeProfileRejectedBeforeDependencies(t *testing.T) {
	t.Parallel()
	c := new(Chronicle)
	_, err := c.enqueueNativeParse(t.Context(), nil, nil, ArgsLogParse{Profile: true}, nil)
	require.ErrorIs(t, err, errNativeProfileUnsupported)
	_, err = c.enqueueReParseLog(t.Context(), nil, nil, uuid.New(), false, false, true, uuid.Nil, chroniclesdk.ParserEngineNext)
	require.ErrorIs(t, err, errNativeProfileUnsupported)
	worker := new(WorkerNativeLogParse)
	err = worker.Work(t.Context(), &river.Job[ArgsNativeLogParse]{Args: ArgsNativeLogParse{ArgsLogParse: ArgsLogParse{Profile: true}}})
	require.ErrorContains(t, err, "CPU profiling is not supported")
}
