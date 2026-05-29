package serviceapi

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"

	"github.com/Emyrk/chronicle/api"
	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/authkeys"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceassets"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicebot"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicegamedata"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicemail"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/serviceriver"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
	"github.com/Emyrk/chronicle/internal/services/serviceapplication"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/servicewowdb"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func API(broker *services.Services) *api.API {
	srv := services.MustGet[*Service](broker)
	return srv.app
}

func OnAPI() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	secretPem       string
	httpAddress     string
	devAuth         bool
	saffronURL      *url.URL
	ocrURL          *url.URL
	shortLinkDomain       string
	clientUploadsDisabled bool
	discordAuth           chronauth.DiscordOAuth
	app             *api.API
	closeListener   func()
}

func New(broker *services.Services) *Service {
	return &Service{
		broker:     broker,
		saffronURL: new(url.URL),
		ocrURL:     new(url.URL),
	}
}

func (s *Service) Name() string {
	return services.ServiceAPI
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicestorage.OnStorage(),
		servicebot.OnDiscordBot(),
		servicedbstore.OnDatabaseStore(),
		servicepgxpool.OnPGXPool(),
		serviceriver.OnRiverQueue(),
		servicechronicle.OnChronicle(),
		serviceprometheus.OnPrometheus(),
		serviceauthz.OnAuthz(),
		servicewowdb.OnWoWDB(),
		serviceassets.OnAssets(),
		servicegamedata.OnInternalGameData(),
		servicerankings.OnRankings(),
		servicemail.OnMailer(),
		serviceaccessurl.OnAccessURL(),
		servicetenant.OnTenant(),
		serviceapplication.OnApplication(),
		servicedataset.OnDataset(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	st := servicestorage.Storage(s.broker)
	bot := servicebot.DiscordBot(s.broker)
	que := serviceriver.RiverQueue(s.broker)
	chron := servicechronicle.Chronicle(s.broker)
	reg := serviceprometheus.Registry(s.broker)
	zed := serviceauthz.Authz(s.broker)
	pool := servicepgxpool.PGXPool(s.broker)
	ps := servicepgxpool.Pubsub(s.broker)
	tenantSvc := servicetenant.Tenant(s.broker)
	appSvc := serviceapplication.Application(s.broker)
	if !appSvc.Enabled() {
		appSvc = nil
	}
	datasetSvc := servicedataset.Dataset(s.broker)

	serverLn, err := ProvisionListener(logger, s.httpAddress)
	if err != nil {
		return err
	}

	accessURL := serviceaccessurl.AccessURL(s.broker)
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

	secretPem := s.secretPem
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

	decodedSecret, err := base64.StdEncoding.DecodeString(secretPem)
	if err != nil {
		return fmt.Errorf("decode jwt secret pem: %w", err)
	}

	saffronURL := s.saffronURL
	if s.saffronURL.Scheme == "" {
		saffronURL = nil
	}
	ocrURL := s.ocrURL
	if s.ocrURL.Scheme == "" {
		ocrURL = nil
	}
	wowdb := servicewowdb.WoWDB(s.broker)
	assets := serviceassets.Assets(s.broker)
	gamedata := servicegamedata.InternalGameData(s.broker)
	rankings := servicerankings.Rankings(s.broker)
	mailer := servicemail.Mailer(s.broker)
	handler, err := api.New(ctx, api.Options{
		Logger:           logger,
		Storage:          st,
		Chronicle:        chron,
		RiverQueue:       que,
		Bot:              bot,
		Registry:         reg,
		Zed:              zed,
		Pool:             pool,
		PS:               ps,
		SaffronURL:       saffronURL,
		OCRURL:           ocrURL,
		WoWDB:            wowdb,
		Assets:           assets,
		InternalGameData: gamedata,
		Rankings:         rankings,
		Mailer:           mailer,

		AccessURL:       au,
		ShortLinkDomain:       s.shortLinkDomain,
		ClientUploadsDisabled: s.clientUploadsDisabled,
		DevOAuth:              s.devAuth,
		Discord:         s.discordAuth,
		SecretPEM:       decodedSecret,
		Tenant:          tenantSvc,
		Application:     appSvc,
		Dataset:         datasetSvc,
	})

	if err != nil {
		return fmt.Errorf("create api: %w", err)
	}

	closeServer := ServeHandler(ctx, logger, handler.Routes(), serverLn, "api")
	s.closeListener = closeServer
	s.app = handler

	return nil
}

func (s *Service) Close(_ context.Context) error {
	defer s.closeListener()
	return s.app.Close()
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "JWT Secret PEM",
			Description: "PEM encoded private key to use for signing JWTs.",
			Required:    false,
			Flag:        "jwt-secret-pem",
			Env:         "CHRONICLE_JWT_SECRET_PEM",
			Default:     "",
			Value:       serpent.StringOf(&s.secretPem),
		},
		{
			Name:        "http-address",
			Description: "Address to serve the api on.",
			Required:    false,
			Flag:        "http-address",
			Env:         "CHRONICLE_HTTP_ADDRESS",
			Default:     "0.0.0.0:4000",
			Value:       serpent.StringOf(&s.httpAddress),
		},
		{
			Name:        "dev-auth",
			Description: "Enable dev oauth auth.",
			Required:    false,
			Flag:        "dev-auth",
			Default:     "false",
			Value:       serpent.BoolOf(&s.devAuth),
		},
		{
			Name:        "Discord OAuth Client ID",
			Description: "Discord OAuth Client ID to use for authentication.",
			Required:    false,
			Flag:        "discord-client-id",
			Env:         "CHRONICLE_DISCORD_CLIENT_ID",
			Default:     "",
			Value:       serpent.StringOf(&s.discordAuth.ClientID),
		},
		{
			Name:        "Discord OAuth Client Secret",
			Description: "Discord OAuth Client Secret to use for authentication.",
			Required:    false,
			Flag:        "discord-client-secret",
			Env:         "CHRONICLE_DISCORD_CLIENT_SECRET",
			Default:     "",
			Value:       serpent.StringOf(&s.discordAuth.ClientSecret),
		},
		{
			Name:        "Internal Saffron URL",
			Description: "Optional proxy to saffron admin dashboard.",
			Required:    false,
			Flag:        "saffron-url",
			Env:         "CHRONICLE_SAFFRON_URL",
			Default:     "",
			Value:       serpent.URLOf(s.saffronURL),
		},
		{
			Name:        "Short Link Domain",
			Description: "Domain for short share links (e.g. chrn.link). If empty, uses same-origin paths.",
			Required:    false,
			Flag:        "short-link-domain",
			Env:         "CHRONICLE_SHORT_LINK_DOMAIN",
			Default:     "",
			Value:       serpent.StringOf(&s.shortLinkDomain),
		},
		{
			Name:        "Client Uploads Disabled",
			Description: "Disable client-side log uploads. Use when server-side logging is active.",
			Required:    false,
			Flag:        "client-uploads-disabled",
			Env:         "CHRONICLE_CLIENT_UPLOADS_DISABLED",
			Default:     "false",
			Value:       serpent.BoolOf(&s.clientUploadsDisabled),
		},
		{
			Name:        "Internal OCR URL",
			Description: "Optional proxy to OCR server for YouTube sync processing.",
			Required:    false,
			Flag:        "ocr-url",
			Env:         "CHRONICLE_OCR_URL",
			Default:     "",
			Value:       serpent.URLOf(s.ocrURL),
		},
	}
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
