package servicechoose_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicechoose"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func tenant(slug, name string, discoverable bool, branding string) database.Tenant {
	return database.Tenant{
		ID:           uuid.New(),
		Slug:         pgtype.Text{String: slug, Valid: true},
		Name:         name,
		Discoverable: discoverable,
		Branding:     []byte(branding),
	}
}

func newService(t *testing.T, accessURL string) *servicechoose.Service {
	t.Helper()
	u, err := url.Parse(accessURL)
	require.NoError(t, err)
	tenants := servicetenant.NewTestWithTenants(*u, "localhost",
		tenant("octo", "OctoWoW", true, ""),
		tenant("capy", "capy", true, `{"display_name":"Capy","tagline":"Capybara realm","square_logo":"/c/capy/logo.png"}`),
		tenant("secret", "Secret", false, ""),
	)
	return servicechoose.NewTest("choose", tenants, *u)
}

func TestDestinations(t *testing.T) {
	t.Parallel()
	svc := newService(t, "http://legacy.localhost:4000")

	require.Equal(t, []servicechoose.Destination{
		{Key: "capy", Name: "Capy", Tagline: "Capybara realm", Logo: "/c/capy/logo.png", Origin: "http://capy.localhost:4000"},
		{Key: "octo", Name: "OctoWoW", Origin: "http://octo.localhost:4000"},
	}, svc.Destinations(), "only discoverable tenants, no main site")
	require.Equal(t, "http://choose.localhost:4000", svc.ChooseURL())
}

func TestPrimaryDomainWithPort(t *testing.T) {
	t.Parallel()
	u, err := url.Parse("http://localhost:4000")
	require.NoError(t, err)
	tenants := servicetenant.NewTestWithTenants(*u, "localhost:4000", tenant("kronos", "Kronos", true, ""))
	svc := servicechoose.NewTest("choose", tenants, *u)

	require.Equal(t, "http://choose.localhost:4000", svc.ChooseURL())
	require.Equal(t, "http://kronos.localhost:4000", svc.Destinations()[0].Origin)
}

func TestMiddleware(t *testing.T) {
	t.Parallel()
	svc := newService(t, "https://legacy.localhost")

	marker := func(name string) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(name))
		})
	}
	handler := svc.Middleware(marker("untenanted"), marker("tenanted"))

	tests := []struct {
		name     string
		method   string
		host     string
		path     string
		accept   string
		wantBody string
	}{
		{name: "PagePath", method: http.MethodGet, host: "choose.localhost", path: "/instances/123", wantBody: "Where should this link open?"},
		{name: "Root", method: http.MethodGet, host: "choose.localhost:4000", path: "/", wantBody: "Where should this link open?"},
		{name: "HTMLWithExtension", method: http.MethodGet, host: "choose.localhost", path: "/notes.v2", accept: "text/html", wantBody: "Where should this link open?"},
		{name: "Asset", method: http.MethodGet, host: "choose.localhost", path: "/c/capy/logo.png", accept: "image/*", wantBody: "untenanted"},
		{name: "API", method: http.MethodGet, host: "choose.localhost", path: "/api/v1/site-config", wantBody: "untenanted"},
		{name: "Post", method: http.MethodPost, host: "choose.localhost", path: "/", wantBody: "untenanted"},
		{name: "OtherTenant", method: http.MethodGet, host: "capy.localhost", path: "/instances/123", wantBody: "tenanted"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req.Host = tc.host
			if tc.accept != "" {
				req.Header.Set("Accept", tc.accept)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			require.Equal(t, http.StatusOK, rec.Code)
			require.Contains(t, rec.Body.String(), tc.wantBody)
		})
	}
}

func TestPageData(t *testing.T) {
	t.Parallel()
	svc := newService(t, "https://legacy.localhost")
	handler := svc.Middleware(http.NotFoundHandler(), http.NotFoundHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "choose.localhost"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	body := rec.Body.String()
	require.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Contains(t, rec.Header().Get("Content-Security-Policy"), "img-src 'self' data: https:",
		"tenant logos are hosted off-site")
	require.NotContains(t, body, "{{CHOOSE_DATA}}")
	require.Contains(t, body, `"origin":"https://capy.localhost"`)
	require.NotContains(t, body, "secret", "non-discoverable tenants are not offered")
	require.Contains(t, body, "Hidden communities are not listed.")
}

func TestDisabled(t *testing.T) {
	t.Parallel()
	var svc *servicechoose.Service
	require.False(t, svc.Enabled())
	require.Empty(t, svc.ChooseURL())

	tenanted := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	require.NotNil(t, svc.Middleware(nil, tenanted))
}
