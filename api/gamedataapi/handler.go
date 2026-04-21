package gamedataapi

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	zed  *authz.Authz
	auth *chronauth.Service
	pool *pgxpool.Pool
}

func New(zed *authz.Authz, auth *chronauth.Service, pool *pgxpool.Pool) *Handler {
	return &Handler{zed: zed, auth: auth, pool: pool}
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(
		h.auth.Authenticated(false),
		httpmw.Can(h.zed, policy.New().GlobalChronicle().CanAdmin_world_data_User),
	)
	r.Post("/wdb/upload", h.UploadWDB)
	r.Post("/sql/import", h.ImportSQL)
	return r
}
