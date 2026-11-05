package riverqueue

import (
	"bytes"
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPersistedJobLogger(t *testing.T) {
	t.Parallel()
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil))
	ctx := context.WithValue(t.Context(), persistedJobLoggerContextKey{}, logger)

	PersistedJobLogger(ctx).InfoContext(ctx, "job invocation", slog.String("outcome", "snoozed"))

	require.Contains(t, output.String(), `"msg":"job invocation"`)
	require.Contains(t, output.String(), `"outcome":"snoozed"`)
	require.NotPanics(t, func() {
		PersistedJobLogger(context.Background()).Info("discarded outside River")
	})
}
