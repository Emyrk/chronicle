package api

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	context2 "github.com/gorilla/context"
	"github.com/prometheus/client_golang/prometheus"
)

type Options struct {
	Logger     *slog.Logger
	Storage    storage.ObjectStorage
	DB         database.Store
	Chronicle  *chronicle.Chronicle
	RiverQueue *riverqueue.Queues
	Bot        *chroniclebot.Bot

	Registry  *prometheus.Registry
	AccessURL *url.URL
	DevOAuth  bool
	Discord   chronauth.DiscordOAuth
	SecretPEM []byte // Used for JWTs
}

type API struct {
	AppContext context.Context
	Opts       *Options
	Auth       *chronauth.Service
	Chronicle  *chronicle.Chronicle
	Queues     *riverqueue.Queues
}

func New(ctx context.Context, opts Options) (*API, error) {
	if opts.Registry == nil {
		opts.Registry = prometheus.NewRegistry()
	}
	service, err := chronauth.New(ctx, opts.Logger, chronauth.Options{
		AccessURL: opts.AccessURL,
		DevServer: opts.DevOAuth,
		Database:  opts.DB,
		Discord:   opts.Discord,
		Bot:       opts.Bot,
		Sessions: chronauth.SessionOptions{
			SecretPEM: opts.SecretPEM,
			Registry:  opts.Registry,
		},
	})
	if err != nil {
		return nil, err
	}

	return &API{
		Opts:       &opts,
		AppContext: ctx,
		Auth:       service,
		Chronicle:  opts.Chronicle,
		Queues:     opts.RiverQueue,
	}, nil
}

func (api *API) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(
		httpmw.Recover(api.Opts.Logger),
		context2.ClearHandler,
		// TODO: Finish cors options
		cors.Handler(cors.Options{}),
		httpmw.NoWWW(),
		httpmw.PrometheusMW(api.Opts.Registry),
	)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(
			api.Auth.AuthenticationMiddleware,
		//authMW.Trace,
		)

		r.Group(func(r chi.Router) {
			r.Use(
				api.Auth.Authenticated(false),
				api.Auth.MustRoles(),
			)
			r.Get("/whoami", api.WhoAmI)
		})

		// Admin routes - require admin or technical_admin role
		r.Route("/admin", func(r chi.Router) {
			r.Use(
				api.Auth.Authenticated(false),
				api.Auth.MustRoles(database.UserRolesAdmin, database.UserRolesTechnicalAdmin),
			)
			r.Get("/users", api.AdminListUsers)
			r.Post("/users/{userID}/resync", api.AdminResyncUserRoles)
			r.Get("/logs", api.AdminListLogs)
		})

		r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { httpapi.Write(r.Context(), w, http.StatusOK, "OK") })
		r.Group(func(r chi.Router) {
			r.Route("/raidlogs", func(r chi.Router) {
				r.Route("/logs", func(r chi.Router) {
					r.Use(
						api.Auth.Authenticated(false),
						api.Auth.MustRoles(),
					)
					r.Group(func(r chi.Router) {
						r.Use(api.Auth.MustRoles(database.UserRolesAlphaTester))
						r.Post("/upload", api.WoWLogUpload)
					})
					r.Get("/", api.WoWLogGroups)
					r.Route("/{logID}", func(r chi.Router) {
						r.Use(httpmw.LogIDMiddleware)
						r.Group(func(r chi.Router) {
							r.Use(api.Auth.MustRoles(database.UserRolesAdmin))
							r.Post("/reparse", api.WoWLogReparse)
						})
						r.Get("/", api.WoWLogGroup)
						r.Group(func(r chi.Router) {
							r.Use(api.Auth.MustRoles(database.UserRolesAlphaTester))
							r.Delete("/", api.WoWLogDeleteGroup)
						})
					})
				})

				r.Group(func(r chi.Router) {
					r.Route("/instances", func(r chi.Router) {
						r.Route("/{instance_id}", func(r chi.Router) {
							r.Use(httpmw.InstanceIDMiddleware(api.Opts.DB))
							r.Get("/events/{type}", api.InstanceEvents)
							r.Get("/", api.Instance)

							r.Get("/youtube", api.GetInstanceYoutube)
							r.Group(func(r chi.Router) {
								r.Use(
									api.Auth.Authenticated(false),
									api.Auth.MustRoles(database.UserRolesAdmin),
								)
								r.Post("/youtube", api.PostInstanceYoutube)
							})
						})
					})
				})
			})
		})
		r.NotFound(http.NotFound)
	})

	// Auth routes
	r.Mount("/auth", api.Auth.Handler())

	// River UI
	r.Group(func(r chi.Router) {
		r.Use(
			api.Auth.AuthenticationMiddleware,
			api.Auth.Authenticated(false),
			api.Auth.MustRoles(database.UserRolesTechnicalAdmin),
		)
		r.Mount("/river", api.Queues.UI)
	})

	r.NotFound(frontend.Handler(frontend.FS()).ServeHTTP)

	return r
}

func (api *API) Close() error {
	return nil
}
