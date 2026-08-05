package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strings"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/gamedataapi"
	"github.com/Emyrk/chronicle/api/guildapi"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/api/linkedapi"
	"github.com/Emyrk/chronicle/api/panellayoutapi"
	"github.com/Emyrk/chronicle/api/retentionapi"
	"github.com/Emyrk/chronicle/api/serviceazerothcore"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/chroniclemail"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/pubsub"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/serviceapplication"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
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
	GameDB           *gamedb.WoWDB // For cache invalidation on DBC import
	Assets           http.Handler
	InternalGameData http.Handler
	ExternalAPI      http.Handler
	Rankings         http.Handler
	Mailer           *chroniclemail.Mailer

	Registry  *prometheus.Registry
	AccessURL *url.URL
	// ShortLinkDomain is the domain used for short share links (e.g. "chrn.link").
	// If empty, short links use same-origin paths instead.
	ShortLinkDomain string
	// ClientUploadsDisabled disables client-side log uploads (for servers using server-side logging).
	ClientUploadsDisabled bool
	// ExternalVerification enables the external character verification
	// provider (e.g. zug-zug). Configured via environment variables; nil
	// when disabled.
	ExternalVerification *chroniclesdk.ExternalVerification
	DevOAuth             bool
	Discord              chronauth.DiscordOAuth
	SecretPEM            []byte // Used for JWTs

	// Tenant is the multi-tenant service for subdomain → tenant resolution.
	// If nil, tenant middleware is a no-op.
	Tenant *servicetenant.Service

	// Application is the server application service for onboarding new servers.
	// If nil, application routes are not registered.
	Application *serviceapplication.Service

	// Dataset is the dataset CRUD service for managing game-data payloads.
	Dataset *servicedataset.Service

	// CacheSvc is the centralized cache service for admin introspection.
	CacheSvc *servicecache.Service
}

type API struct {
	AppContext     context.Context
	Opts           *Options
	Auth           *chronauth.Service
	Chronicle      *chronicle.Chronicle
	Queues         *riverqueue.Queues
	Zed            *authz.Authz
	discoveryStats discoveryStatsCache
}

func New(ctx context.Context, opts Options) (*API, error) {
	if opts.Registry == nil {
		opts.Registry = prometheus.NewRegistry()
	}
	var tenantChecker func(host string) *chronauth.TenantInfo
	if opts.Tenant != nil {
		tenantChecker = func(host string) *chronauth.TenantInfo {
			slug := opts.Tenant.ExtractSlug(host)
			if slug == "" {
				return nil
			}
			t, ok := opts.Tenant.GetTenantBySlug(slug)
			if !ok {
				return nil
			}
			return &chronauth.TenantInfo{
				Slug: t.Slug.String,
				Name: t.Name,
			}
		}
	}

	service, err := chronauth.New(ctx, opts.Logger, chronauth.Options{
		AccessURL:     opts.AccessURL,
		DevServer:     opts.DevOAuth,
		Discord:       opts.Discord,
		Bot:           opts.Bot,
		Zed:           opts.Zed,
		Mailer:        opts.Mailer,
		TenantChecker: tenantChecker,
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
		httpmw.Log500(api.Opts.Logger),
		context2.ClearHandler,
		RouteCors(api.Opts.Tenant),
		httpmw.SecurityHeaders(),
		httpmw.ContentSecurityPolicy(),
		httpmw.NoWWW(),
		httpmw.PrometheusMW(api.Opts.Registry),
		middleware.Compress(5,
			"text/html", "text/css", "application/javascript", "text/javascript",
			"application/json", "text/javascript",
		),
		api.shortLinkRedirectMiddleware,
		api.tenantMiddleware,
	)

	if api.Opts.ExternalAPI != nil {
		r.Mount(ExternalAPIPath, api.Opts.ExternalAPI)
	}

	r.Route("/api/v1", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			// Not browser-only
			r.Get("/discovery", api.Discovery)
		})

		r.Group(func(r chi.Router) {

			r.Use(
				httpmw.BrowserOnly(api.Opts.AccessURL),
				api.Auth.AuthenticationMiddleware,
			)

			r.Group(func(r chi.Router) {
				r.Use(
					api.Auth.Authenticated(false),
				)
				r.Get("/whoami", api.WhoAmI)
				r.Get("/whoami/dump", api.DumpToken)
				r.Post("/authcheck", api.checkAuthorization)
				r.Get("/me/storage", api.GetMyStorage)
				r.Patch("/me/preferences", api.UpdateMyPreferences)

				r.Get("/me/talent-builds", api.ListMyTalentBuilds)
				r.Post("/me/talent-builds", api.CreateMyTalentBuild)
				r.Patch("/me/talent-builds/{buildID}", api.UpdateMyTalentBuild)
				r.Delete("/me/talent-builds/{buildID}", api.DeleteMyTalentBuild)
				r.Post("/share", api.CreateShare)
			})
			r.Mount("/panel-layout", panellayoutapi.New(api.Opts.Zed, api.Auth).Routes())
			// Account↔character link management.
			r.Mount("/linked", linkedapi.New(api.Opts.Zed, api.Auth, api.Opts.ExternalVerification).Routes())
			gameDataHandler := gamedataapi.New(api.Opts.Zed, api.Auth, api.Opts.Pool, api.Opts.GameDB)
			r.Mount("/game-data", gameDataHandler.Routes())
			r.Mount("/azerothcore", serviceazerothcore.New(api.Opts.Logger, api.Opts.Zed, api.Auth, api.Chronicle).Routes())
			if api.Opts.Application != nil {
				r.Group(func(r chi.Router) {
					r.Use(api.Auth.Authenticated(true))
					r.Mount("/server-application", api.Opts.Application.Routes(api.Zed))
				})
			} else {
				r.Handle("/server-application", http.NotFoundHandler())
				r.Handle("/server-application/*", http.NotFoundHandler())
			}
			r.Get("/share/{code}", api.GetShare)
			r.Get("/site-config", api.AdminGetSiteConfig)
			r.Get("/discovery", api.Discovery)
			// Public read-only dataset list for the talent-tree dataset selector.
			r.Get("/datasets", api.Opts.Dataset.List)
			r.Get("/flavors", api.ListFlavors)

			// Admin routes - require admin or technical_admin role
			r.Route("/admin", func(r chi.Router) {
				r.Use(api.Auth.Authenticated(false))
				r.Route("/users", func(r chi.Router) {
					r.Use(
						httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User),
					)

					r.Get("/", api.AdminListUsers)
					r.Post("/{userID}/resync", api.AdminResyncUserRoles)
					r.Put("/{userID}/roles", api.AdminSetUserRoles)
					r.Put("/{userID}/retention", api.AdminSetUserRetention)
					r.Get("/{userID}/grants", api.GetUserGrants)
					r.Put("/{userID}/grants", api.UpsertUserGrant)
					r.Delete("/{userID}/grants/{source}", api.DeleteUserGrant)
				})

				r.Route("/logs", func(r chi.Router) {
					r.Use(
						httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_logs_User),
					)
					r.Get("/", api.AdminListLogs)
					r.Post("/delete", api.AdminBulkDeleteLogs)
					r.Post("/reparse", api.AdminBulkReparseLogs)
				})

				r.Group(func(r chi.Router) {
					r.Route("/leaderboard", func(r chi.Router) {
						r.Get("/version-requirements", api.AdminListLeaderboardVersionRequirements)
						r.Group(func(r chi.Router) {
							r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_speedrun_requirements_User))
							r.Put("/version-requirements", api.AdminUpsertLeaderboardVersionRequirements)
						})
					})
				})

				r.Route("/parses", func(r chi.Router) {
					r.Use(httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User))
					r.Post("/rankings/refresh", api.AdminRefreshRankings)
					r.Post("/snapshot", api.AdminTriggerParseSnapshot)
					r.Get("/snapshots", api.AdminListSnapshots)
					r.Post("/snapshots/delete", api.AdminBulkDeleteSnapshots)
					r.Delete("/snapshots/{snapshotID}", api.AdminDeleteSnapshot)

					// Time-parse snapshot admin
					r.Post("/time-parse-snapshot", api.AdminTriggerTimeParseSnapshot)
					r.Get("/time-parse-snapshots", api.AdminListTimeParseSnapshots)
					r.Post("/time-parse-snapshots/delete", api.AdminBulkDeleteTimeParseSnapshots)
					r.Delete("/time-parse-snapshots/{snapshotID}", api.AdminDeleteTimeParseSnapshot)
				})

				// Tenant management — routes owned by servicetenant
				r.Route("/tenants", func(r chi.Router) {
					r.Use(
						httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_tenants_User),
					)
					r.Mount("/", api.Opts.Tenant.Routes())
				})
				r.Put("/servers/{serverID}/tenant", api.Opts.Tenant.SetServerTenant)
				r.Put("/servers/{serverID}/dataset", api.Opts.Tenant.SetServerDataset)

				// Dataset management — routes owned by servicedataset
				r.Route("/datasets", func(r chi.Router) {
					r.Use(
						httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_tenants_User),
					)
					r.Mount("/", api.Opts.Dataset.Routes())
				})

				r.Group(func(r chi.Router) {
					r.Use(
						// TODO: Determine right authz
						httpmw.Can(api.Zed, policy.New().GlobalChronicle().CanAdmin_users_User),
					)
					r.Get("/instance-names", api.AdminListInstanceNames)
					r.Get("/outdated-instances", api.AdminListOutdatedInstances)
					r.Post("/outdated-instances/reparse", api.AdminBulkReparseOutdatedInstances)
					r.Get("/site-config", api.AdminGetSiteConfig)
					r.Put("/site-config", api.AdminUpdateSiteConfig)
					r.Get("/cache-stats", api.AdminGetCacheStats)
					r.Post("/cache-stats/purge", api.AdminPurgeCache)
					r.Post("/cache-stats/purge/{name}", api.AdminPurgeCache)

					r.Mount("/retention", retentionapi.New(api.Zed, api.Queues).Routes())
				})
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
					r.Get("/speedruns/clears", api.GuildRaidClears)
					r.Get("/characters", api.GuildCharacterRoster)
					r.Get("/encounters", api.GuildEncounterKills)
					r.Get("/parses/top", api.GuildTopParses)
					r.Get("/parses/runs", api.GuildRunParses)

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
			r.Get("/armory/{realm}/{player}/gear-history", api.GetArmoryPlayerGearHistory)
			r.Get("/armory/{realm}/{player}/loot", api.GetArmoryPlayerLoot)

			// Public realm listing
			r.Get("/realms", api.ListPublicRealms)

			// Public census data
			r.Get("/census", api.Census)

			// Public site-wide statistics
			r.Get("/stats", api.SiteStats)

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
								r.Get("/overview", api.InstanceOverviewMetrics)
								r.Get("/speedrun", api.InstanceSpeedrun)
								r.Get("/speedrun/cohort", api.InstanceSpeedrunCohort)
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

			if api.Opts.Rankings != nil {
				r.Mount("/rankings", api.Opts.Rankings)

				// Backward-compat: old /leaderboard/speedrun/* → /rankings/speedrun/*
				r.Route("/leaderboard", func(r chi.Router) {
					r.Get("/speedrun", api.redirectToRankings("/rankings/speedrun"))
					r.Get("/speedrun/instances", api.redirectToRankings("/rankings/speedrun/instances"))
					r.Get("/speedrun/realms", api.redirectToRankings("/rankings/speedrun/realms"))
					r.Get("/speedrun/rules", api.redirectToRankings("/rankings/speedrun/rules"))
				})
			}

			if api.Opts.InternalGameData != nil {
				r.Group(func(r chi.Router) {
					r.Use(api.Auth.Authenticated(true))
					r.Mount("/internal/gamedata", api.Opts.InternalGameData)
				})
			}

			r.NotFound(http.NotFound)
		})
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

	r.NotFound(frontend.Handler(frontend.FS(), api.OGRoutes(), api.brandingResolver).ServeHTTP)

	return r
}

// brandingResolver returns per-request branding for the HTML template
// (title, favicon, theme CSS) based on tenant context or site-level branding.
func (api *API) brandingResolver(r *http.Request) *frontend.HTMLBranding {
	// Tenant branding takes priority.
	if t := servicetenant.TenantFromContext(r.Context()); t != nil {
		branding := chroniclesdk.TenantFromDB(*t).Branding
		if branding != nil && branding.DisplayName != "" {
			b := &frontend.HTMLBranding{
				Title:    branding.DisplayName + " by Chronicle",
				ThemeCSS: buildThemeCSS(branding),
			}
			if branding.Favicon != "" {
				b.Favicon = branding.Favicon
			}
			return b
		}
	}

	// Fall back to site-level branding.
	config, err := api.Opts.Zed.GetSiteConfig(r.Context())
	if err != nil {
		return nil
	}
	branding := unmarshalBranding(config.Branding)
	if branding != nil && branding.DisplayName != "" {
		b := &frontend.HTMLBranding{
			Title:    branding.DisplayName + " by Chronicle",
			ThemeCSS: buildThemeCSS(branding),
		}
		if branding.Favicon != "" {
			b.Favicon = branding.Favicon
		}
		return b
	}

	return nil
}

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// themeKnob maps a branding theme key to the CSS variables it controls.
type themeKnob struct {
	// direct are CSS variable names set to the hex value as-is.
	direct []string
	// derived are CSS variable names set via color-mix from the hex value.
	derived []struct {
		name string
		mix  string // e.g. "color-mix(in oklch, %s 60%%, black)"
	}
}

// themeKnobs defines every configurable color knob and the CSS variables it
// drives. Keep in sync with the frontend ThemeEditor KNOBS array.
//
//nolint:gochecknoglobals // package-level lookup table
var themeKnobs = map[string]themeKnob{
	"primary": {
		direct: []string{"--primary", "--tertiary"},
		derived: []struct {
			name string
			mix  string
		}{
			{"--primary-darker", "color-mix(in oklch, %s 60%%, black)"},
			{"--sidebar-primary", "color-mix(in oklch, %s 60%%, black)"},
			{"--ring", "color-mix(in oklch, %s 75%%, black)"},
			{"--sidebar-ring", "color-mix(in oklch, %s 75%%, black)"},
		},
	},
	"accent": {
		direct: []string{"--secondary", "--accent", "--sidebar-accent"},
	},
	"background": {
		direct: []string{"--background"},
	},
	"card": {
		direct: []string{"--card", "--muted", "--sidebar", "--popover"},
	},
	"border": {
		direct: []string{"--border", "--input", "--sidebar-border"},
	},
	"foreground": {
		direct: []string{
			"--foreground", "--card-foreground", "--popover-foreground",
			"--secondary-foreground", "--accent-foreground",
			"--sidebar-foreground", "--sidebar-accent-foreground",
		},
	},
	"muted_text": {
		direct: []string{"--muted-foreground"},
	},
	"link": {
		direct: []string{"--link"},
	},
	"destructive": {
		direct: []string{"--destructive"},
	},
}

// buildThemeCSS produces CSS variable overrides from branding theme colors.
// Only validated hex values are emitted; invalid values are silently skipped.
func buildThemeCSS(branding *chroniclesdk.Branding) string {
	if branding == nil || len(branding.Theme) == 0 {
		return ""
	}

	var b strings.Builder
	for key, hex := range branding.Theme {
		if !hexColorRe.MatchString(hex) {
			continue
		}
		knob, ok := themeKnobs[key]
		if !ok {
			continue
		}
		for _, v := range knob.direct {
			fmt.Fprintf(&b, "%s: %s; ", v, hex)
		}
		for _, d := range knob.derived {
			fmt.Fprintf(&b, "%s: "+d.mix+"; ", d.name, hex)
		}
	}
	return b.String()
}

// redirectToRankings returns a handler that redirects to a /rankings/* path,
// preserving the original query string. Used for backward compat with old
// /leaderboard/speedrun/* URLs.
func (api *API) redirectToRankings(target string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := target
		if r.URL.RawQuery != "" {
			u += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, u, http.StatusTemporaryRedirect)
	}
}

func (api *API) Close() error {
	return nil
}
