package api

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/gamedataapi"
	"github.com/Emyrk/chronicle/api/guildapi"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/api/panellayoutapi"
	"github.com/Emyrk/chronicle/api/retentionapi"
	"github.com/Emyrk/chronicle/api/serviceazerothcore"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/chroniclemail"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/pubsub"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	context2 "github.com/gorilla/context"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
)

type Options struct {
	Logger           *slog.Logger
	Storage          storage.ObjectStorage
	Zed              *authz.Authz
	Pool             *pgxpool.Pool
	PS               pubsub.Pubsub
	Chronicle        *chronicle.Chronicle
	RiverQueue       *riverqueue.Queues
	Bot              *chroniclebot.Bot
	SaffronURL       *url.URL
	OCRURL           *url.URL
	WoWDB            http.Handler
	Assets           http.Handler
	InternalGameData http.Handler
	Mailer           *chroniclemail.Mailer

	Registry  *prometheus.Registry
	AccessURL *url.URL
	// ShortLinkDomain is the domain used for short share links (e.g. "chrn.link").
	// If empty, short links use same-origin paths instead.
	ShortLinkDomain string
	DevOAuth        bool
	Discord         chronauth.DiscordOAuth
	SecretPEM       []byte // Used for JWTs
}

type API struct {
	AppContext  context.Context
	Opts        *Options
	Auth        *chronauth.Service
	Chronicle   *chronicle.Chronicle
	Queues      *riverqueue.Queues
	Zed         *authz.Authz
	recentCache *recentRaidsCache
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
		Mailer:    opts.Mailer,
		Sessions: chronauth.SessionOptions{
			SecretPEM: opts.SecretPEM,
			Registry:  opts.Registry,
		},
	})
	if err != nil {
		return nil, err
	}

	return &API{
		Opts:        &opts,
		AppContext:  ctx,
		Auth:        service,
		Chronicle:   opts.Chronicle,
		Queues:      opts.RiverQueue,
		Zed:         opts.Zed,
		recentCache: newRecentRaidsCache(5 * time.Minute),
	}, nil
}

func (api *API) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(
		httpmw.Recover(api.Opts.Logger),
		httpmw.Log500(api.Opts.Logger),
		context2.ClearHandler,
		Cors(api.Opts.AccessURL),
		httpmw.SecurityHeaders(),
		httpmw.ContentSecurityPolicy(),
		httpmw.NoWWW(),
		httpmw.PrometheusMW(api.Opts.Registry),
		middleware.Compress(5,
			"text/html", "text/css", "application/javascript", "text/javascript",
			"application/json", "text/javascript",
		),
		api.shortLinkRedirectMiddleware,
	)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(
			httpmw.BrowserOnly(api.Opts.AccessURL),
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
			r.Patch("/me/preferences", api.UpdateMyPreferences)
			r.Post("/share", api.CreateShare)
		})
		r.Mount("/panel-layout", panellayoutapi.New(api.Opts.Zed, api.Auth).Routes())
		gameDataHandler := gamedataapi.New(api.Opts.Zed, api.Auth, api.Opts.Pool, api.Opts.PS)
		r.Mount("/game-data", gameDataHandler.Routes())
		r.Mount("/world", gameDataHandler.PublicRoutes())
		r.Mount("/azerothcore", serviceazerothcore.New(api.Opts.Logger, api.Opts.Zed, api.Auth, api.Chronicle).Routes())
		r.Get("/share/{code}", api.GetShare)
		r.Get("/site-config", api.AdminGetSiteConfig)

		// Admin routes - require admin or technical_admin role
		r.Route("/admin", func(r chi.Router) {
			r.Use(
				api.Auth.Authenticated(false),
				httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User),
			)
			r.Get("/users", api.AdminListUsers)
			r.Post("/users/{userID}/resync", api.AdminResyncUserRoles)
			r.Put("/users/{userID}/roles", api.AdminSetUserRoles)
			r.Put("/users/{userID}/retention", api.AdminSetUserRetention)
			r.Get("/users/{userID}/grants", api.GetUserGrants)
			r.Put("/users/{userID}/grants", api.UpsertUserGrant)
			r.Delete("/users/{userID}/grants/{source}", api.DeleteUserGrant)
			r.Get("/logs", api.AdminListLogs)
			r.Get("/instance-names", api.AdminListInstanceNames)
			r.Get("/outdated-instances", api.AdminListOutdatedInstances)
			r.Post("/outdated-instances/reparse", api.AdminBulkReparseOutdatedInstances)
			r.Get("/site-config", api.AdminGetSiteConfig)
			r.Put("/site-config", api.AdminUpdateSiteConfig)

			r.Route("/leaderboard", func(r chi.Router) {
				r.Get("/version-requirements", api.AdminListLeaderboardVersionRequirements)
				r.Group(func(r chi.Router) {
					r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_speedrun_requirements_User))
					r.Put("/version-requirements", api.AdminUpsertLeaderboardVersionRequirements)
				})
			})

			r.Mount("/retention", retentionapi.New(api.Zed, api.Queues).Routes())
		})

		// Regression testing routes (under admin auth)
		r.Route("/regression", func(r chi.Router) {
			r.Use(
				api.Auth.Authenticated(false),
				httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_regressions_User),
			)
			r.Get("/fixtures", api.RegressionListFixtures)
			r.Post("/fixtures", api.RegressionCreateFixture)
			r.Put("/fixtures/{fixtureID}", api.RegressionUpdateFixtureNote)
			r.Delete("/fixtures/{fixtureID}", api.RegressionDeleteFixture)
			r.Post("/fixtures/{fixtureID}/snapshot", api.RegressionTakeSnapshot)
			r.Post("/snapshot-all", api.RegressionSnapshotAll)
			r.Get("/fixtures/{fixtureID}/snapshots", api.RegressionListSnapshots)
			r.Get("/snapshots/{snapshotID}", api.RegressionGetSnapshot)
			r.Delete("/snapshots/{snapshotID}", api.RegressionDeleteSnapshot)
			r.Get("/jobs", api.RegressionJobStatus)
			r.Post("/requeue-version", api.RegressionRequeueVersion)
		})

		r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { httpapi.Write(r.Context(), w, http.StatusOK, "OK") })
		if api.Opts.WoWDB != nil {
			r.Mount("/wowdb", api.Opts.WoWDB)
		}
		if api.Opts.Assets != nil {
			r.Mount("/assets", api.Opts.Assets)
		}
		// Guild routes
		r.Route("/guilds", func(r chi.Router) {
			r.Get("/config", api.GuildPageOptions)
			r.Get("/", api.ListGuilds)
			r.Route("/{guildID}", func(r chi.Router) {
				r.Use(
					httpmw.GuildIDMiddleware(api.Zed),
					api.Auth.Authenticated(true),
				)
				r.Get("/", api.GetGuild)
				r.Get("/page", api.GetGuildPage)
				r.Get("/settings", api.GetGuildSettings)

				// Authenticated routes (non-admin)
				r.Group(func(r chi.Router) {
					r.Use(api.Auth.Authenticated(false))
					r.Post("/join-requests", api.CreateJoinRequest)
					r.Get("/join-requests/me", api.MyJoinRequest)
				})

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
						r.Put("/{userID}/role", api.AdminUpdateGuildMemberRole)
						r.Delete("/{userID}", api.AdminRemoveGuildMember)
					})
					r.Put("/settings", api.UpdateGuildSettings)
					r.Get("/join-requests", api.ListJoinRequests)
					r.Post("/join-requests/{requestID}/accept", api.AcceptJoinRequest)
					r.Delete("/join-requests/{requestID}", api.DenyJoinRequest)

					r.Put("/page", api.UpsertGuildPage)
					r.Post("/page/tabs", api.CreateGuildPageTab)
					r.Put("/page/tabs/reorder", api.ReorderGuildPageTabs)
					r.Put("/page/tabs/{tabID}", api.UpdateGuildPageTab)
					r.Delete("/page/tabs/{tabID}", api.DeleteGuildPageTab)
				})

				// Guild roster route (viewable by members, leaders, and admins)
				r.Group(func(r chi.Router) {
					r.Use(
						api.Auth.Authenticated(false),
						guildapi.Can(api.Zed, func(on *policy.ObjGuild) func(sub *policy.ObjUser) rel.Relationship {
							return on.CanView_chronicle_roster_User
						}),
					)
					r.Get("/roster", api.GuildRoster)
				})
			})
		})

		// Public guild page route
		r.Get("/g/{guildID}", api.GetPublicGuildPage)
		// Public armory routes
		r.Get("/armory/search", api.SearchArmoryPlayers)
		r.Get("/armory/{realm}/{player}", api.GetArmoryPlayer)

		r.Group(func(r chi.Router) {
			r.Route("/raidlogs", func(r chi.Router) {
				r.Get("/supported", api.SupportedInstances)
				r.Get("/recent", api.RecentInstances)
				r.Get("/range", api.InstancesByTimeRange)
				r.Route("/logs", func(r chi.Router) {
					r.Group(func(r chi.Router) {
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
				})

				r.Group(func(r chi.Router) {
					r.Route("/instances", func(r chi.Router) {
						r.Route("/{instance_id}", func(r chi.Router) {
							r.Use(httpmw.InstanceIDMiddleware(api.Opts.Zed))
							r.Get("/events/{type}", api.InstanceEvents)
							r.Get("/", api.Instance)

							r.Get("/youtube", api.GetInstanceYoutube)
							r.Get("/loot", api.GetInstanceLoot)
							r.Get("/speedrun", api.InstanceSpeedrun)
							r.Get("/duplicates", api.ListDuplicateInstances)

							r.Group(func(r chi.Router) {
								r.Use(
									api.Auth.Authenticated(false),
								)
								r.Post("/youtube", api.PostInstanceYoutube)
							})

							r.Group(func(r chi.Router) {
								r.Use(
									api.Auth.Authenticated(false),
									httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_logs_User),
								)
								r.Delete("/duplicate-group", api.UngroupInstance)
							})
						})
					})
				})
			})
		})

		r.Route("/leaderboard", func(r chi.Router) {
			r.Get("/speedrun", api.SpeedrunLeaderboard)
			r.Get("/speedrun/instances", api.SpeedrunInstances)
			r.Get("/speedrun/realms", api.SpeedrunRealms)
			r.Get("/speedrun/rules", api.SpeedrunRules)
		})

		if api.Opts.InternalGameData != nil {
			r.Group(func(r chi.Router) {
				r.Use(api.Auth.Authenticated(true))
				r.Mount("/internal/gamedata", api.Opts.InternalGameData)
			})
		}

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

	r.NotFound(frontend.Handler(frontend.FS(), api.OGRoutes()).ServeHTTP)

	return r
}

func (api *API) Close() error {
	return nil
}
