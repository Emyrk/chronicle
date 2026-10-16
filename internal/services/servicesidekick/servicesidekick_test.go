package servicesidekick

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestMountedRoutes(t *testing.T) {
	t.Parallel()

	service := &Service{}
	service.setupRoutes()

	router := chi.NewRouter()
	router.Mount("/api/v1/me/sidekicks", service.AccountRoutes())
	router.Mount("/api/v1/sidekick", service.StatusRoutes())
	router.Mount("/api/v1/admin/users/{userID}/sidekicks", service.AdminRoutes())

	actual := make(map[string]struct{})
	require.NoError(t, chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		actual[method+" "+route] = struct{}{}
		return nil
	}))
	require.Equal(t, map[string]struct{}{
		http.MethodGet + " /api/v1/me/sidekicks/":                   {},
		http.MethodPatch + " /api/v1/me/sidekicks/{sidekickID}":     {},
		http.MethodDelete + " /api/v1/me/sidekicks/{sidekickID}":    {},
		http.MethodPut + " /api/v1/sidekick/status":                 {},
		http.MethodGet + " /api/v1/admin/users/{userID}/sidekicks/": {},
	}, actual)
}
