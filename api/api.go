package api

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/guildapi"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	context2 "github.com/gorilla/context"
	"github.com/prometheus/client_golang/prometheus"
)

type Options struct {
	Logger     *slog.Logger
	Storage    storage.ObjectStorage
	Zed        *authz.Authz
	Chronicle  *chronicle.Chronicle
	RiverQueue *riverqueue.Queues
	Bot        *chroniclebot.Bot
	SaffronURL *url.URL
	OCRURL     *url.URL
	WoWDB      http.Handler

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
	Zed        *authz.Authz
}

func New(ctx context.Context, opts Options) (*API, error) {
	if opts.Registry == nil {
		opts.Registry = prometheus.NewRegistry()
	}
	service, err := chronauth.New(ctx, opts.Logger, chronauth.Options{
		AccessURL: opts.AccessURL,
		DevServer: opts.DevOAuth,
		Discord:   opts.Discord,
		Bot:       opts.Bot,
		Zed:       opts.Zed,
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
		Zed:        opts.Zed,
	}, nil
}

func (api *API) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(
		httpmw.Recover(api.Opts.Logger),
		context2.ClearHandler,
		// TODO: Finish cors options
		Cors(api.Opts.AccessURL),
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
			)
			r.Get("/whoami", api.WhoAmI)
			r.Post("/authcheck", api.checkAuthorization)
			r.Get("/me/storage", api.GetMyStorage)
			r.Route("/{userID}/panel-layouts", func(r chi.Router) {
				r.Use(httpmw.UserIDMiddleware(api.Opts.Zed))
				r.Get("/", api.ListUserPanelLayouts)
				r.Post("/", api.CreateUserPanelLayout)
				r.Get("/{title}", api.GetUserPanelLayoutByTitle)
				r.Delete("/{layoutID}", api.DeleteUserPanelLayoutByID)
			})
		})

		// Admin routes - require admin or technical_admin role
		r.Route("/admin", func(r chi.Router) {
			r.Use(
				api.Auth.Authenticated(false),
				httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User),
			)
			r.Get("/users", api.AdminListUsers)
			r.Post("/users/{userID}/resync", api.AdminResyncUserRoles)
			r.Get("/users/{userID}/grants", api.GetUserGrants)
			r.Put("/users/{userID}/grants", api.UpsertUserGrant)
			r.Delete("/users/{userID}/grants/{source}", api.DeleteUserGrant)
			r.Get("/logs", api.AdminListLogs)
			r.Get("/instance-names", api.AdminListInstanceNames)

		})

		r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { httpapi.Write(r.Context(), w, http.StatusOK, "OK") })
		if api.Opts.WoWDB != nil {
			r.Mount("/wowdb", api.Opts.WoWDB)
		}
		// Guild routes
		r.Route("/guilds", func(r chi.Router) {
			r.Get("/", api.ListGuilds)
			r.Route("/{guildID}", func(r chi.Router) {
				r.Use(httpmw.GuildIDMiddleware(api.Zed))
				r.Get("/", api.GetGuild)
				r.Get("/page", api.GetGuildPage)

				// Protected guild page editing routes
				r.Group(func(r chi.Router) {
					r.Use(
						api.Auth.Authenticated(false),
						// TODO: Make different perms for managing members vs editing page content
						guildapi.Can(api.Zed, func(on *policy.ObjGuild) func(sub *policy.ObjUser) rel.Relationship {
							return on.CanAdmin_guild_User
						}),
					)
					r.Route("/members", func(r chi.Router) {
						// Guild member management (admin only)
						r.Post("/", api.AdminAddGuildMember)
						r.Delete("/{userID}", api.AdminRemoveGuildMember)
					})

					r.Put("/page", api.UpsertGuildPage)
					r.Post("/page/tabs", api.CreateGuildPageTab)
					r.Put("/page/tabs/reorder", api.ReorderGuildPageTabs)
					r.Put("/page/tabs/{tabID}", api.UpdateGuildPageTab)
					r.Delete("/page/tabs/{tabID}", api.DeleteGuildPageTab)
				})
			})
		})

		// Public guild page route
		r.Get("/g/{guildID}", api.GetPublicGuildPage)

		r.Group(func(r chi.Router) {
			r.Route("/raidlogs", func(r chi.Router) {
				r.Get("/supported", api.SupportedInstances)
				r.Get("/recent", api.RecentInstances)
				r.Route("/logs", func(r chi.Router) {
					r.Use(
						api.Auth.Authenticated(false),
					)
					r.Group(func(r chi.Router) {
						r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanUpload_log_User))
						r.Post("/upload", api.WoWLogUpload)
						r.Post("/upload-v2", api.WoWLogUploadV2)
					})
					r.Get("/", api.WoWLogGroups)
					r.Get("/by-file-hash/{file-hash}", api.WoWLogGroupByFile)
					r.Route("/{logID}", func(r chi.Router) {
						r.Use(httpmw.LogIDMiddleware)
						r.Group(func(r chi.Router) {
							r.Post("/reparse", api.WoWLogReparse)
							r.Delete("/delete-files", api.DeleteWoWLogFiles)
							r.Delete("/instances/{instance_id}", api.WoWLogDeleteInstance)
						})
						r.Get("/", api.WoWLogGroup)
						r.Get("/files/{fileID}/download", api.WoWLogFileDownload)
						r.Group(func(r chi.Router) {
							r.Delete("/", api.WoWLogDeleteGroup)
						})
					})
				})

				r.Group(func(r chi.Router) {
					r.Route("/instances", func(r chi.Router) {
						r.Route("/{instance_id}", func(r chi.Router) {
							r.Use(httpmw.InstanceIDMiddleware(api.Opts.Zed))
							r.Get("/events/{type}", api.InstanceEvents)
							r.Get("/", api.Instance)

							r.Get("/youtube", api.GetInstanceYoutube)
							r.Group(func(r chi.Router) {
								r.Use(
									api.Auth.Authenticated(false),
									httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanUpload_youtube_User),
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
			httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_queues_User),
		)
		r.Mount("/river", api.Queues.UI)
	})

	r.Group(func(r chi.Router) {
		r.Use(
			api.Auth.AuthenticationMiddleware,
			api.Auth.Authenticated(false),
			httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdminister_authz_User),
		)

		if api.Opts.SaffronURL != nil {
			proxy := httputil.NewSingleHostReverseProxy(api.Opts.SaffronURL)
			// Don't strip prefix - Next.js is configured with basePath: "/saffron"
			r.Mount("/saffron", proxy)
		} else {
			r.Mount("/saffron", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte("Saffron URL not configured"))
			}))
		}
	})

	// OCR proxy - for YouTube sync OCR processing
	r.Group(func(r chi.Router) {
		r.Use(
			api.Auth.AuthenticationMiddleware,
			api.Auth.Authenticated(false),
			httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanUpload_youtube_User),
		)

		if api.Opts.OCRURL != nil {
			proxy := httputil.NewSingleHostReverseProxy(api.Opts.OCRURL)
			r.Mount("/ocr", http.StripPrefix("/ocr", proxy))
		} else {
			r.Mount("/ocr", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte("OCR URL not configured"))
			}))
		}
	})

	r.NotFound(frontend.Handler(frontend.FS()).ServeHTTP)

	return r
}

func (api *API) Close() error {
	return nil
}
