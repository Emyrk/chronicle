package servicereferencedata

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
)

func TestReferenceDataDisabledByDefault(t *testing.T) {
	t.Parallel()
	service := New(services.New())

	require.False(t, service.Enabled())
	require.NoError(t, service.Start(context.Background()))
	require.Nil(t, service.Store())
	options := service.Options()
	require.Len(t, options, 1)
	require.Equal(t, "reference-data-enabled", options[0].Flag)
	require.Equal(t, "CHRONICLE_REFERENCE_DATA_ENABLED", options[0].Env)
	require.Equal(t, "false", options[0].Default)
}
