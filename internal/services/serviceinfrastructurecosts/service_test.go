package serviceinfrastructurecosts

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEnabledConfigurationRequiresAllRailwayValues(t *testing.T) {
	t.Parallel()
	s := &Service{enabled: true}
	err := s.Start(context.Background())
	require.ErrorContains(t, err, "CHRONICLE_RAILWAY_API_TOKEN")
	require.ErrorContains(t, err, "CHRONICLE_RAILWAY_WORKSPACE_ID")
	require.ErrorContains(t, err, "CHRONICLE_RAILWAY_PROJECT_ID")
}
func TestDisabledConfigurationNeedsNoCredentials(t *testing.T) {
	t.Parallel()
	s := &Service{}
	require.NoError(t, s.Start(context.Background()))
	require.False(t, s.Enabled())
}
