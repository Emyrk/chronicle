package api

import (
	"net/http"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestIsAccessURLHost(t *testing.T) {
	t.Parallel()

	accessURL := &url.URL{Scheme: "https", Host: "legacy.chronicle.example.com"}
	api := &API{Opts: &Options{AccessURL: accessURL}}

	for _, test := range []struct {
		name string
		host string
		want bool
	}{
		{name: "access URL", host: "legacy.chronicle.example.com", want: true},
		{name: "access URL with port", host: "legacy.chronicle.example.com:4000", want: true},
		{name: "case insensitive", host: "LEGACY.CHRONICLE.EXAMPLE.COM", want: true},
		{name: "tenant subdomain", host: "epoch.chronicle.example.com", want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, api.isAccessURLHost(test.host))
		})
	}
}

func TestMetricTenant(t *testing.T) {
	t.Parallel()

	accessURL := &url.URL{Scheme: "https", Host: "legacy.chronicle.example.com"}
	tenantService := servicetenant.NewTestWithTenants(
		*accessURL,
		"chronicle.example.com",
		database.Tenant{Slug: pgtype.Text{String: "epoch", Valid: true}},
	)
	api := &API{Opts: &Options{Tenant: tenantService, AccessURL: accessURL}}

	tests := []struct {
		name string
		host string
		want string
	}{
		{name: "root", host: "chronicle.example.com", want: metricTenantRoot},
		{name: "access URL", host: "legacy.chronicle.example.com", want: metricTenantRoot},
		{name: "access URL with port", host: "legacy.chronicle.example.com:4000", want: metricTenantRoot},
		{name: "known tenant", host: "epoch.chronicle.example.com", want: "epoch"},
		{name: "known tenant with port", host: "epoch.chronicle.example.com:4000", want: "epoch"},
		{name: "unknown tenant", host: "other.chronicle.example.com", want: metricTenantUnknown},
		{name: "unrelated host", host: "example.net", want: metricTenantRoot},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			request := &http.Request{Host: test.host}
			require.Equal(t, test.want, api.metricTenant(request))
		})
	}
}

func TestMetricTenantWithoutTenantService(t *testing.T) {
	t.Parallel()

	api := &API{Opts: &Options{}}
	require.Equal(t, metricTenantRoot, api.metricTenant(&http.Request{Host: "anything.example.com"}))
}
