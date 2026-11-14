package encounters

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/stretchr/testify/require"
)

func TestGraphResolverBindsFreshRuntimeWithoutInvokingFactory(t *testing.T) {
	t.Parallel()
	calls := 0
	var observed context.Context
	var observedLogger *slog.Logger
	recipe := &GraphRecipe{ID: "context-bound", Resolve: func(ctx context.Context, logger *slog.Logger, _ bool, _ zone.Zone, _ *unitdb.Units) *instances.Hookable {
		calls++
		observed, observedLogger = ctx, logger
		return nil
	}}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	state, err := recipe.New(ctx, logger)
	require.NoError(t, err)
	require.Zero(t, calls, "binding a runtime must not invoke a gameplay factory")
	state.instanceResolver(false, zone.Zone{}, state.Units)
	require.Equal(t, 1, calls)
	require.Same(t, ctx, observed)
	require.Same(t, logger, observedLogger)
	second, stop := context.WithCancel(t.Context())
	defer stop()
	bound := recipe.resolver(second, slog.Default())
	require.Equal(t, 1, calls)
	bound(false, zone.Zone{}, unitdb.New())
	require.Same(t, second, observed)
	require.Same(t, slog.Default(), observedLogger)
	recipe.Resolver = state.instanceResolver
	_, err = recipe.New(ctx, logger)
	require.ErrorContains(t, err, "incomplete")
}
