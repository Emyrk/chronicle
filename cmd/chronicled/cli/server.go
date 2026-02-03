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
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spice"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/xerrors"

	"github.com/coder/serpent"
)

const testPem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEAxx8Vf4l9lV6rXNMQ+DzoI3Wnw/39rbLuFLO0saoZU44WW2JA
I798w18tzWBljOhAsKkJQBtTbPFOySD4hzI4o2EML6lw46IwWRc/2dO2mQvN+mRN
B8qHAHmL0C4t6bwttdL8/jI91QtBxyto0C/t/KUs1BGwmGi+P+NfvK63ndC97Yvf
Dt3/UIlCA1tRe+jmNF/g3wAI0OSJU4EoO36xPeN8YQFx46w/S8V1M5+7bkkGNR+R
qwJv7bWJgMEtZYK4Tld/3MuPfs0qXZhRS/xkKlCnfxi/ONma+qXbEJDc3CdiGyIl
WcWZMfekaaFHy3+3O7zz564R7Kcc57lkNpqZnQIDAQABAoIBAACaIBLSpSN8BJAC
DnE7jK5J19u0xTNHZzhD4ZpxwxCcYRAAv700i++3mLllA66DO2nq3diZ7cfgZCK+
7ijTGlsy3+t7IEnK/FzmIqKsH/iY9DtnbU9GQmmfL4lXwclR5xtTK64xsU9mDjzb
7VtbLDRsRoGAGvYf7qSPHeYQdN2rcBPFIw+nU5NUnVMDEut+CvCpQDXJTrl4+AuF
yksIigkT+6eTF83N8G1/hcQTnH5gPTk3NDpOKhssPQQRdrw3y023QSFld1XWL4D0
lUCc4qmkFRooSYojFOLV+joPZnHf/TY+EC5Gn+3IXoi06Uc/fmeKA3Cmdh5AaINU
O6gO2gECgYEA6AY3qhqEd+Z6WlrvP9Zfy/bpiMtkm3UrOeTDiOAUrzAP1fZqvXMI
x/P5KjLd1kedHVmk/xbCEWomSGvN1InwK/LOub0pvuz5SQOLzfjbqroAHNvuyVLc
SfYnNHi+vLchZDmdN0yd21CUalW/N+2JSQMtmisjgEGolYBIn++80CkCgYEA27J7
FVMNzetnGjoxhfu+zgBlUV7DthbzxaeZfObcTeCvUxy0IP6vSlsK29GpTrU6VxPF
baXU5+qq1ibQuBOI1L3+VsYEP5UH0C0EfjO+rdO5hPYKJz0JtX80iFVSRKii/17g
zjWnrQ5RuXuOZ4Mga37HIQcz6WSM2HBqIIWdHFUCgYEA3VJg8p+M0JpHB71KDki8
5GBIb7Yj564iZ3zxj7S/xkRANsZxFvmN3L26ZShUNzvkgMSsAK+Cuv3YOqiqlBxn
vmREESSBl5+QQrdhOj4xu27lAKJB6kRh4SMuTn0G5BiDf4j9kGxC/5qjl7LnTcAF
fmHLtA2GNadr2f+eRwF1x9ECgYEAj5E8A7xpmfZKQwZiVIclsiLqEtmVlYm8NZ8H
m2qV7sJ0cCCiyakFTdbe6rVBKbEedcbyzmt/DSr6BsYIwTHqyfN6oKP4JMC0AWNZ
u0r/QULJykyqZ+foT1XYM3tmLn3xPmZ3C+peL6Xa3BYVAinbZsPLRxcY4l0V+V7E
y4nlGJ0CgYEAlYY6JPRvXeUvPhLVYqjH0AOQBY6agvJEWMg3QF8/BmsuurnRc2gs
bQ2Blnt2E4cZoxYQ009O2geNZWWr5Zssw7p5ZyBnXNE7/HhNdjMpy74tmpawhpXy
N3BZeV4tW5UPWN4Px3cyMnv4afIuY1ehS5RI6Y5dA6lTqPs0Qa6dfnw=
-----END RSA PRIVATE KEY-----`

func ServerCmd() *serpent.Command {
	var (
		httpAddress       string
		accessURL         string
		devAuth           bool
		postgresURL       string
		spiceDBURL        string
		spiceDBEnabled    bool
		discord           chronauth.DiscordOAuth
		secretPem         string
		storageFlag       string
		riverOpts         chronicle.RiverQueueOptions
		prometheusEnabled bool
		promtheusAddress  string
		pprofEnabled      bool
		pprofAddress      string
		disableSignups    bool
	)
	cmd := &serpent.Command{
		Use: "server",
		Options: []serpent.Option{
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
				Name:        "Postgres URL",
				Description: "Postgres URL to connect to.",
				Required:    false,
				Flag:        "postgres-url",
				Env:         "CHRONICLE_POSTGRES_URL",
				Default:     "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable",
				Value:       serpent.StringOf(&postgresURL),
			},
			{
				Name:        "SpiceDB URL",
				Description: "SpiceDB to connect to.",
				Required:    false,
				Flag:        "spicedb-url",
				Env:         "CHRONICLE_SPICEDB_URL",
				Default:     "localhost:50051",
				Value:       serpent.StringOf(&spiceDBURL),
			},
			{
				Name:        "Enable SpiceDB",
				Description: "Enable SpiceDB.",
				Required:    false,
				Flag:        "enable-spicedb",
				Env:         "CHRONICLE_ENABLE_SPICEDB",
				Default:     "false",
				Value:       serpent.BoolOf(&spiceDBEnabled),
			},
			{
				Name:        "Discord OAuth Client ID",
				Description: "Discord OAuth Client ID to use for authentication.",
				Required:    false,
				Flag:        "discord-client-id",
				Env:         "CHRONICLE_DISCORD_CLIENT_ID",
				Default:     "",
				Value:       serpent.StringOf(&discord.ClientID),
			},
			{
				Name:        "Discord OAuth Client Secret",
				Description: "Discord OAuth Client Secret to use for authentication.",
				Required:    false,
				Flag:        "discord-client-secret",
				Env:         "CHRONICLE_DISCORD_CLIENT_SECRET",
				Default:     "",
				Value:       serpent.StringOf(&discord.ClientSecret),
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
			{
				Name:        "Disable Signups",
				Description: "Disable new user signups.",
				Required:    false,
				Flag:        "disable-signups",
				Env:         "CHRONICLE_DISABLE_SIGNUPS",
				Default:     "false",
				Value:       serpent.BoolOf(&disableSignups),
			},
		},
		Handler: func(i *serpent.Invocation) error {
			ctx, cancelApp := context.WithCancel(context.Background())
			defer cancelApp()
			logger := getLogger(i)
			reg := prometheus.NewRegistry()

			db, err := Database(ctx, logger, postgresURL)
			if err != nil {
				return err
			}
			//nolint:errcheck
			defer db.Close()

			var sdb *spice.Spice
			if spiceDBEnabled {
				sdb, err = spice.New(ctx, &spice.Options{
					GRPCURL: spiceDBURL,
					Logger:  logger,
					Store:   db,
					Debug:   true,
				})
				if err != nil {
					return fmt.Errorf("connect to spicedb: %w", err)
				}
				db = sdb
			}

			serverLn, err := ProvisionListener(logger, httpAddress)
			if err != nil {
				return err
			}

			if accessURL == "" {
				addr := serverLn.Addr().(*net.TCPAddr)
				if addr.IP.IsUnspecified() {
					accessURL = fmt.Sprintf("http://localhost:%d", addr.Port)
				} else {
					accessURL = fmt.Sprintf("http://%s", serverLn.Addr().String())
				}
				logger.Info("access url not specified, using server address", slog.String("url", accessURL))
			}

			au, err := url.Parse(accessURL)
			if err != nil {
				return fmt.Errorf("invalid access url: %w", err)
			}

			switch secretPem {
			case "dev":
				secretPem = base64.StdEncoding.EncodeToString([]byte(testPem))
			case "":
				sec, err := authkeys.GenerateKey()
				if err != nil {
					return fmt.Errorf("generate jwt secret: %w", err)
				}
				secretPem = base64.StdEncoding.EncodeToString(authkeys.MarshalPrivateKey(sec))
				logger.Warn("using ephemeral JWT secret; this is not recommended for production environments")
			}

			var files storage.ObjectStorage
			if storageFlag == "local" {
				files, err = storage.NewLocalStorage()
				if err != nil {
					return fmt.Errorf("provision local storage: %w", err)
				}
			} else {
				parts := strings.Split(storageFlag, ":")
				if len(parts) != 2 {
					return fmt.Errorf("invalid storage flag format; expected 'supabaseProject:supabaseKey'")
				}
				files, err = storage.Supabase(parts[0], parts[1])
				if err != nil {
					return fmt.Errorf("provision supabase storage: %w", err)
				}
			}

			decodedSecret, err := base64.StdEncoding.DecodeString(secretPem)
			if err != nil {
				return fmt.Errorf("decode jwt secret pem: %w", err)
			}
			riverOpts.DBURL = postgresURL
			handler, err := api.New(ctx, api.Options{
				Logger:          logger,
				Storage:         files,
				DB:              db,
				Registry:        reg,
				AccessURL:       au,
				DevOAuth:        devAuth,
				Discord:         discord,
				SecretPEM:       decodedSecret,
				RiverQueue:      riverOpts,
				DisallowSignups: disableSignups,
			})
			if err != nil {
				return err
			}

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

func ProvisionListener(logger *slog.Logger, addr string) (net.Listener, error) {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		logger.Error("http server listen", slog.String("addr", addr), slog.String("error", err.Error()))
		return nil, err
	}
	return ln, nil
}

func ServeHandler(ctx context.Context, logger *slog.Logger, handler http.Handler, ln net.Listener, name string) func() {
	// ReadHeaderTimeout is purposefully not enabled. It caused some issues with
	// websockets over the dev tunnel.
	// See: https://github.com/coder/coder/pull/3730
	//nolint:gosec
	srv := &http.Server{
		Handler:     handler,
		BaseContext: func(_ net.Listener) context.Context { return ctx },
	}

	go func() {
		//nolint:errcheck
		defer ln.Close()
		logger.Info("http server listening", slog.String("addr", ln.Addr().String()), slog.String("name", name))
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server serve", slog.String("addr", ln.Addr().String()), slog.String("name", name), slog.String("error", err.Error()))
		}
	}()

	return func() {
		_ = srv.Close()
	}
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

func launchPrometheus(ctx context.Context, logger *slog.Logger, address string, registry *prometheus.Registry) {
	srv := http.Server{
		Addr:    address,
		Handler: promhttp.HandlerFor(registry, promhttp.HandlerOpts{}),
		BaseContext: func(listener net.Listener) context.Context {
			return ctx
		},
	}
	go func() {
		logger.Info("Starting prometheus server", slog.String("address", address))
		err := srv.ListenAndServe()
		if err != nil {
			logger.Error("prometheus server", slog.String("service", "prometheus"), slog.String("error", err.Error()))
		}
	}()
}

func launchPprof(ctx context.Context, logger *slog.Logger, address string) {
	mux := http.NewServeMux()
	mux.Handle("/debug/pprof/", http.HandlerFunc(pprof.Index))
	mux.Handle("/debug/pprof/cmdline", http.HandlerFunc(pprof.Cmdline))
	mux.Handle("/debug/pprof/profile", http.HandlerFunc(pprof.Profile))
	mux.Handle("/debug/pprof/symbol", http.HandlerFunc(pprof.Symbol))
	mux.Handle("/debug/pprof/trace", http.HandlerFunc(pprof.Trace))

	srv := http.Server{
		Addr:    address,
		Handler: mux,
		BaseContext: func(listener net.Listener) context.Context {
			return ctx
		},
	}
	go func() {
		logger.Info("Starting pprof server", slog.String("address", address))
		err := srv.ListenAndServe()
		if err != nil {
			logger.Error("pprof server", slog.String("service", "pprof"), slog.String("error", err.Error()))
		}
	}()
}
