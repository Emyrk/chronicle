package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spice"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	context2 "github.com/gorilla/context"
	"github.com/prometheus/client_golang/prometheus"
)

type Options struct {
	Logger          *slog.Logger
	Storage         storage.ObjectStorage
	DB              database.Store
	Registry        *prometheus.Registry
	AccessURL       *url.URL
	DevOAuth        bool
	Discord         chronauth.DiscordOAuth
	DiscordBot      *chroniclebot.Bot
	SecretPEM       []byte // Used for JWTs
	RiverQueue      chronicle.RiverQueueOptions
	DisallowSignups bool
	Authz           *spice.Spice
}

type API struct {
	AppContext     context.Context
	Opts           *Options
	Authentication *chronauth.Service
	Chronicle      *chronicle.Chronicle
}

func New(ctx context.Context, opts Options) (*API, error) {
	if opts.Registry == nil {
		opts.Registry = prometheus.NewRegistry()
	}
	if opts.Authz == nil {
		return nil, errors.New("no authz provided")
	}
	service, err := chronauth.New(ctx, opts.Logger, chronauth.Options{
		AccessURL:  opts.AccessURL,
		DevServer:  opts.DevOAuth,
		Database:   opts.DB,
		Discord:    opts.Discord,
		DiscordBot: opts.DiscordBot,
		Sessions: chronauth.SessionOptions{
			SecretPEM: opts.SecretPEM,
			Registry:  opts.Registry,
		},
		BlockSignups: opts.DisallowSignups,
	})
	if err != nil {
		return nil, err
	}

	chr, err := chronicle.New(ctx, opts.Logger, chronicle.Options{
		Storage: opts.Storage,
		DB:      opts.DB,
		Queue:   opts.RiverQueue,
	})
	if err != nil {
		return nil, fmt.Errorf("chronicle: %w", err)
	}

	return &API{
		Opts:           &opts,
		AppContext:     ctx,
		Authentication: service,
		Chronicle:      chr,
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
			api.Authentication.AuthenticationMiddleware,
		//authMW.Trace,
		)

		r.Group(func(r chi.Router) {
			r.Use(api.Authentication.Authenticated(false))
			r.Get("/whoami", api.WhoAmI)
		})

		r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { httpapi.Write(r.Context(), w, http.StatusOK, "OK") })
		r.Group(func(r chi.Router) {
			r.Route("/raidlogs", func(r chi.Router) {
				r.Route("/logs", func(r chi.Router) {
					r.Use(api.Authentication.Authenticated(false))
					r.Post("/upload", api.WoWLogUpload)
					r.Get("/", api.WoWLogGroups)
					r.Route("/{logID}", func(r chi.Router) {
						r.Use(httpmw.LogIDMiddleware)
						r.Post("/reparse", api.WoWLogReparse)
						r.Get("/", api.WoWLogGroup)
						r.Delete("/", api.WoWLogDeleteGroup)
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
								r.Use(api.Authentication.Authenticated(false))
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
	r.Mount("/auth", api.Authentication.Handler())

	// River UI
	r.Group(func(r chi.Router) {
		r.Use(
			api.Authentication.AuthenticationMiddleware,
			api.Authentication.Authenticated(false),
			httpmw.ViewRiverQueue(api.Opts.Authz),
		)
		r.Mount("/river", api.Chronicle.RiverUI())
	})

	r.NotFound(frontend.Handler(frontend.FS()).ServeHTTP)

	return r
}

func (api *API) Close() error {
	cerr := api.Chronicle.Close()
	return errors.Join(cerr)
}
