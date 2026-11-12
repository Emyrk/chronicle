package api

import (
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestSiteAdsEnabled(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		deploymentEnabled bool
		rootEnabled       bool
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
			rootEnabled:       true,
			tenant:            &database.Tenant{AdsEnabled: true},
		},
		{
			name:              "tenant disabled ignores root setting",
			deploymentEnabled: true,
			rootEnabled:       true,
			tenant:            &database.Tenant{},
		},
		{
			name:              "root enabled",
			deploymentEnabled: true,
			rootEnabled:       true,
			expected:          true,
		},
		{
			name:              "root disabled",
			deploymentEnabled: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, siteAdsEnabled(test.deploymentEnabled, test.rootEnabled, test.tenant))
		})
	}
}

func TestSiteClientUploadsDisabled(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		config   database.SiteConfig
		tenant   *database.Tenant
		expected bool
	}{
		{name: "enabled on root"},
		{name: "globally disabled on root", config: database.SiteConfig{ClientUploadsDisabled: true}, expected: true},
		{name: "globally disabled on tenant", config: database.SiteConfig{ClientUploadsDisabled: true}, tenant: &database.Tenant{}, expected: true},
		{name: "root disabled on root", config: database.SiteConfig{RootUploadsDisabled: true}, expected: true},
		{name: "root disabled leaves tenant enabled", config: database.SiteConfig{RootUploadsDisabled: true}, tenant: &database.Tenant{}},
		{name: "tenant disabled", tenant: &database.Tenant{DisableClientUpload: true}, expected: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, siteClientUploadsDisabled(test.config, test.tenant))
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
			name: "ads txt and NitroPay site ID configured",
			options: Options{
				AdsTxtURL:      adsTxtURL,
				NitroPaySiteID: "12345",
			},
			expected: true,
		},
		{
			name:    "missing client ID",
			options: Options{AdsTxtURL: adsTxtURL},
		},
		{
			name:    "missing ads txt",
			options: Options{NitroPaySiteID: "12345"},
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
