package gamedataapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	zed   *authz.Authz
	auth  *chronauth.Service
	pool  *pgxpool.Pool
	wowDB *gamedb.WoWDB
}

func New(zed *authz.Authz, auth *chronauth.Service, pool *pgxpool.Pool, wowDB *gamedb.WoWDB) *Handler {
	return &Handler{zed: zed, auth: auth, pool: pool, wowDB: wowDB}
}

// datasetIDFromQuery parses the optional ?dataset_id= query param.
// Resolution order:
//  1. Explicit ?dataset_id= query param
//  2. Tenant's default dataset (from tenant context / subdomain)
//  3. Server's compiled-in default dataset
//
// Returns false (after writing a 400) when the param is present but malformed.
func datasetIDFromQuery(ctx context.Context, w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	if dsStr := r.URL.Query().Get("dataset_id"); dsStr != "" {
		parsed, err := uuid.Parse(dsStr)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid dataset_id",
				Detail:  err.Error(),
			})
			return uuid.Nil, false
		}
		return parsed, true
	}
	// Fall back to tenant's default dataset if available.
	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DefaultDatasetID.Valid {
		return t.DefaultDatasetID.UUID, true
	}
	return servicedataset.DefaultDatasetID, true
}

func (h *Handler) canManageConsumables(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		actor, ok := authz.ActorFromContext(ctx)
		if !ok {
			httpapi.Forbidden(w, nil)
			return
		}

		// Check the established world-data permission first so technical admins
		// can manage consumables even while a development SpiceDB instance is
		// still running the schema from before admin_consumables was introduced.
		canManageWorldData, err := h.zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_world_data_User(actor))
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if canManageWorldData {
			next.ServeHTTP(w, r)
			return
		}

		canManageConsumables, err := h.zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_consumables_User(actor))
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if !canManageConsumables {
			httpapi.Forbidden(w, nil)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(h.auth.Authenticated(false))

	r.Group(func(r chi.Router) {
		r.Use(httpmw.Can(h.zed, policy.New().GlobalChronicle().CanAdmin_world_data_User))
		r.Post("/wdb/upload", h.UploadWDB)
		r.Post("/sql/import", h.ImportSQL)
		r.Post("/sql/import-url", h.ImportSQLFromURL)
		r.Post("/dbc/upload", h.UploadDBC)
		r.Put("/datasets/{datasetID}/talent-trees", h.UploadTalentTrees)

		// World <-> Server assignment
		r.Post("/worlds/{worldID}/servers/{serverID}", h.AssignWorldToServer)
		r.Delete("/worlds/{worldID}/servers/{serverID}", h.UnassignWorldFromServer)
	})

	r.Get("/datasets/{datasetID}/consumable-disambiguations", h.ListConsumableEffectPolicies)

	r.Group(func(r chi.Router) {
		r.Use(h.canManageConsumables)
		r.Put("/datasets/{datasetID}/consumable-disambiguations/{effectKind}/{spellID}", h.SetConsumableDisambiguation)
		r.Put("/datasets/{datasetID}/consumable-disambiguations/{effectKind}/{spellID}/ignore", h.IgnoreConsumableEffect)
		r.Delete("/datasets/{datasetID}/consumable-disambiguations/{effectKind}/{spellID}", h.DeleteConsumableDisambiguation)
	})

	return r
}
