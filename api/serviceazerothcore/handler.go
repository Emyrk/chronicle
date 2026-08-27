package serviceazerothcore

import (
	"log/slog"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ServiceAccountID is the well-known UUID for the chronicle-service user
// created by migration 000082. Used for server-side log uploads.
var ServiceAccountID = uuid.MustParse("8e3cd4a1-a9f6-4190-8de5-ef037e534981")

type Handler struct {
	logger    *slog.Logger
	zed       *authz.Authz
	auth      *chronauth.Service
	chronicle *chronicle.Chronicle
}

func New(logger *slog.Logger, zed *authz.Authz, auth *chronauth.Service, chron *chronicle.Chronicle) *Handler {
	return &Handler{logger: logger, zed: zed, auth: auth, chronicle: chron}
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()

	// Upload: key-based auth (no session)
	r.Post("/upload", h.ServerLogUpload)
	r.Get("/ping", h.Ping)

	// Admin CRUD: session auth required, per-resource permission checks in handlers.
	r.Group(func(r chi.Router) {
		r.Use(
			h.auth.Authenticated(false),
			servicetenant.AdminBypassMW,
		)

		// Server management
		r.Get("/servers", h.ListServers)                    // filtered by wow_server#administer
		r.Post("/servers", h.CreateServer)                  // requires chronicle#admin_servers (global)
		r.Put("/servers/{serverID}", h.UpdateServer)        // requires wow_server#administer
		r.Delete("/servers/{serverID}", h.DeleteServer)     // requires wow_server#administer
		r.Get("/servers/{serverID}/realms", h.ListRealms)   // requires wow_server#administer
		r.Post("/servers/{serverID}/realms", h.CreateRealm) // requires wow_server#administer

		// Realm management (administer inherited from server)
		r.Put("/realms/{realmID}", h.UpdateRealm)           // requires wow_server_realm#administer
		r.Delete("/realms/{realmID}", h.DeleteRealm)        // requires wow_server_realm#administer
		r.Get("/realms/{realmID}/keys", h.ListUploadKeys)   // requires wow_server_realm#administer
		r.Post("/realms/{realmID}/keys", h.CreateUploadKey) // requires wow_server_realm#administer
		r.Delete("/keys/{keyID}", h.DeleteUploadKey)        // requires realm's wow_server_realm#administer
	})

	return r
}
