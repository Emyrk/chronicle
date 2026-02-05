package cli

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"

	"github.com/coder/serpent"
)

func ServeCmd() *serpent.Command {
	srvs := services.New()
	err := srvs.Register(
		servicelogger.New(srvs),
		servicepgxpool.New(srvs),
	)
	if err != nil {
		panic(fmt.Sprintf("register service: %v", err))
	}
	optionSet := srvs.OptionSet()

	var (
		httpAddress       string
		accessURL         string
		devAuth           bool
		discordOauth      chronauth.DiscordOAuth
		discordBot        chroniclebot.Config
		secretPem         string
		storageFlag       string
		riverOpts         chronicle.RiverQueueOptions
		prometheusEnabled bool
		promtheusAddress  string
		pprofEnabled      bool
		pprofAddress      string
	)
	optionSet = append(optionSet, serpent.OptionSet{
		{
			Name:        "http-address",
			Description: "Address to serve the api on.",
			Required:    false,
			Flag:        "http-address",
			Env:         "CHRONICLE_HTTP_ADDRESS",
			Default:     "0.0.0.0:4000",
			Value:       serpent.StringOf(&httpAddress),
		},
		{
			Name:        "access-url",
			Description: "Access url to access the server from outside the cluster.",
			Required:    false,
			Flag:        "access-url",
			Env:         "CHRONICLE_ACCESS_URL",
			Default:     "",
			Value:       serpent.StringOf(&accessURL),
		},
		{
			Name:        "dev-auth",
			Description: "Enable dev oauth auth.",
			Required:    false,
			Flag:        "dev-auth",
			Default:     "false",
			Value:       serpent.BoolOf(&devAuth),
		},
		{
			Name:        "Discord bot token",
			Description: "Address to serve the api on.",
			Required:    true,
			Flag:        "discord-token",
			Env:         "CHRONICLE_DISCORD_BOT_TOKEN",
			Default:     "",
			Value:       serpent.StringOf(&discordBot.Token),
		},
		{
			Name:        "Discord Chronicle GuildID",
			Description: "Address to serve the api on.",
			Required:    false,
			Flag:        "discord-guild-id",
			Env:         "CHRONICLE_DISCORD_GUILD_ID",
			Default:     "1466099237669306380",
			Value:       serpent.StringOf(&discordBot.GuildID),
		},
		{
			Name:        "Discord OAuth Client ID",
			Description: "Discord OAuth Client ID to use for authentication.",
			Required:    false,
			Flag:        "discord-client-id",
			Env:         "CHRONICLE_DISCORD_CLIENT_ID",
			Default:     "",
			Value:       serpent.StringOf(&discordOauth.ClientID),
		},
		{
			Name:        "Discord OAuth Client Secret",
			Description: "Discord OAuth Client Secret to use for authentication.",
			Required:    false,
			Flag:        "discord-client-secret",
			Env:         "CHRONICLE_DISCORD_CLIENT_SECRET",
			Default:     "",
			Value:       serpent.StringOf(&discordOauth.ClientSecret),
		},
		{
			Name:        "JWT Secret PEM",
			Description: "PEM encoded private key to use for signing JWTs.",
			Required:    false,
			Flag:        "jwt-secret-pem",
			Env:         "CHRONICLE_JWT_SECRET_PEM",
			Default:     "",
			Value:       serpent.StringOf(&secretPem),
		},
		{
			Name:        "Storage",
			Description: "What storage to use for file storage.",
			Required:    false,
			Flag:        "storage",
			Env:         "CHRONICLE_FILE_STORAGE",
			// Otherwise set to "supabaseProject:supabaseKey"
			Default: "local",
			Value:   serpent.StringOf(&storageFlag),
		},
		{
			Name:        "Log Parsing Worker Count",
			Description: "Number of workers to use for parsing raid log files.",
			Required:    false,
			Flag:        "log-parse-worker-count",
			Env:         "CHRONICLE_LOG_PARSING_WORKERS",
			Default:     "1",
			Value:       serpent.Int64Of(&riverOpts.LogParsingWorkers),
		},
		{
			Name:        "Prometheus Enabled",
			Description: "Enable Prometheus metrics server.",
			Required:    false,
			Flag:        "prometheus-enabled",
			Env:         "CHRONICLE_PROMETHEUS_ENABLED",
			Default:     "false",
			Value:       serpent.BoolOf(&prometheusEnabled),
		},
		{
			Name:        "Prometheus Address",
			Description: "Address for Prometheus metrics server to listen on.",
			Required:    false,
			Flag:        "prometheus-address",
			Env:         "CHRONICLE_PROMETHEUS_ADDRESS",
			Default:     "0.0.0.0:9091",
			Value:       serpent.StringOf(&promtheusAddress),
		},
		{
			Name:        "Pprof Enabled",
			Description: "Enable pprof server.",
			Required:    false,
			Flag:        "pprof-enabled",
			Env:         "CHRONICLE_PPROF_ENABLED",
			Default:     "false",
			Value:       serpent.BoolOf(&pprofEnabled),
		},
		{
			Name:        "Pprof Address",
			Description: "Address for pprof server to listen on.",
			Required:    false,
			Flag:        "pprof-address",
			Env:         "CHRONICLE_PPROF_ADDRESS",
			Default:     "0.0.0.0:6060",
			Value:       serpent.StringOf(&pprofAddress),
		},
	}...)

	cmd := &serpent.Command{
		Use:     "serve",
		Options: optionSet,
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()

			logger := getLogger(i)
			err := srvs.Start(ctx, logger)
			if err != nil {
				return fmt.Errorf("start services: %w", err)
			}

			return nil
		},
	}
	return cmd
}
