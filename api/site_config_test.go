package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestTenantAdsEnabled(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		deploymentEnabled bool
		tenant            *database.Tenant
		expected          bool
	}{
		{
			name:              "deployment and tenant enabled",
			deploymentEnabled: true,
			tenant:            &database.Tenant{AdsEnabled: true},
			expected:          true,
		},
		{
			name:              "deployment disabled",
			deploymentEnabled: false,
			tenant:            &database.Tenant{AdsEnabled: true},
		},
		{
			name:              "tenant disabled",
			deploymentEnabled: true,
			tenant:            &database.Tenant{},
		},
		{
			name:              "root domain",
			deploymentEnabled: true,
			tenant:            nil,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, tenantAdsEnabled(test.deploymentEnabled, test.tenant))
		})
	}
}
