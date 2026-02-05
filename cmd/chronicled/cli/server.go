package cli

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/pprof"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api"
	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/authkeys"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/xerrors"

	"github.com/coder/serpent"
)


func ServerCmd() *serpent.Command {
	var (
		devAuth           bool
		postgresURL       string
		discordOauth      chronauth.DiscordOAuth
		storageFlag       string
		pprofEnabled      bool
		pprofAddress      string
	)
	cmd := &serpent.Command{
		Use: "server",
		Options: []serpent.Option{
			{
				Name:        "dev-auth",
				Description: "Enable dev oauth auth.",
				Required:    false,
				Flag:        "dev-auth",
				Default:     "false",
				Value:       serpent.BoolOf(&devAuth),
			},
			{
				Name:        "Postgres URL",
				Description: "Postgres URL to connect to.",
				Required:    false,
				Flag:        "postgres-url",
				Env:         "CHRONICLE_POSTGRES_URL",
				Default:     "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable",
				Value:       serpent.StringOf(&postgresURL),
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
				Name:        "Storage",
				Description: "What storage to use for file storage.",
				Required:    false,
				Flag:        "storage",
				Env:         "CHRONICLE_FILE_STORAGE",
				// Otherwise set to "supabaseProject:supabaseKey"
				Default: "local",
				Value:   serpent.StringOf(&storageFlag),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()
			logger := getLogger(i)
			reg := prometheus.NewRegistry()




			if prometheusEnabled {
				launchPrometheus(ctx, logger, promtheusAddress, reg)
			}

			if pprofEnabled {
				launchPprof(ctx, logger, pprofAddress)
			}

			closeServer := ServeHandler(ctx, logger, handler.Routes(), serverLn, "api")
			defer closeServer()

			<-i.Context().Done()

			terminate, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			done := make(chan struct{})
			go func() {
				defer close(done)
				closeServer()
				err := handler.Close()
				if err != nil {
					logger.Error("closing chronicle", slog.String("error", err.Error()))
				}
				err = db.Close()
				if err != nil {
					logger.Error("closing database", slog.String("error", err.Error()))
				}
				cancelApp()
				err = bot.Close()
				if err != nil {
					logger.Error("closing discord bot", slog.String("error", err.Error()))
				}
			}()

			select {
			case <-done:
				return nil
			case <-terminate.Done():
				return fmt.Errorf("timed out waiting for server to close")
			}
		},
	}
	return cmd
}

func Database(ctx context.Context, logger *slog.Logger, dbURL string) (database.Store, error) {
	dbURL, err := escapePostgresURLUserInfo(dbURL)
	if err != nil {
		return nil, err
	}
	pool, err := database.NewPostgresDB(ctx, logger, dbURL)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres db: %w", err)
	}

	return database.New(pool), nil
}




var reInvalidPortAfterHost = regexp.MustCompile(`invalid port ".+" after host`)

// If the user provides a postgres URL with a password that contains special
// characters, the URL will be invalid. We need to escape the password so that
// the URL parse doesn't fail at the DB connector level.
func escapePostgresURLUserInfo(v string) (string, error) {
	_, err := url.Parse(v)
	// I wish I could use errors.Is here, but this error is not declared as a
	// variable in net/url. :(
	if err != nil {
		// Warning: The parser may also fail with an "invalid port" error if the password contains special
		// characters. It does not detect invalid user information but instead incorrectly reports an invalid port.
		//
		// See: https://github.com/coder/coder/issues/16319
		if strings.Contains(err.Error(), "net/url: invalid userinfo") || reInvalidPortAfterHost.MatchString(err.Error()) {
			// If the URL is invalid, we assume it is because the password contains
			// special characters that need to be escaped.

			// get everything before first @
			parts := strings.SplitN(v, "@", 2)
			if len(parts) != 2 {
				return "", xerrors.Errorf("invalid postgres url with userinfo: %s", v)
			}
			start := parts[0]
			// get password, which is the last item in start when split by :
			startParts := strings.Split(start, ":")
			password := startParts[len(startParts)-1]
			// escape password, and replace the last item in the startParts slice
			// with the escaped password.
			//
			// url.PathEscape is used here because url.QueryEscape
			// will not escape spaces correctly.
			newPassword := url.PathEscape(password)
			startParts[len(startParts)-1] = newPassword
			start = strings.Join(startParts, ":")
			return start + "@" + parts[1], nil
		}

		return "", xerrors.Errorf("parse postgres url: %w", err)
	}

	return v, nil
}

