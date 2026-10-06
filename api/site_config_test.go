package api

import (
	"net/url"
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

func TestAdsDeploymentEnabled(t *testing.T) {
	t.Parallel()

	adsTxtURL := &url.URL{Scheme: "https", Host: "chronicleclassic.com", Path: "/ads.txt"}
	tests := []struct {
		name     string
		options  Options
		expected bool
	}{
		{
			name: "ads txt and client ID configured",
			options: Options{
				AdsTxtURL:       adsTxtURL,
				AdSenseClientID: "ca-pub-8208259743822818",
			},
			expected: true,
		},
		{
			name:    "missing client ID",
			options: Options{AdsTxtURL: adsTxtURL},
		},
		{
			name:    "missing ads txt",
			options: Options{AdSenseClientID: "ca-pub-8208259743822818"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			api := &API{Opts: &test.options}
			require.Equal(t, test.expected, api.adsDeploymentEnabled())
		})
	}
}
