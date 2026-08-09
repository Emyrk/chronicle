package servicepgxpool

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/pubsub"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/xerrors"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func PGXPool(broker *services.Services) *pgxpool.Pool {
	srv := services.MustGet[*Service](broker)
	return srv.pool
}

func Pubsub(broker *services.Services) pubsub.Pubsub {
	srv := services.MustGet[*Service](broker)
	return srv.ps
}

func OnPGXPool() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	pgURL         string
	maxConns      int64
	pool          *pgxpool.Pool
	ps            pubsub.Pubsub
	monitorCancel context.CancelFunc
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServicePGXPool
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	dbURL, err := escapePostgresURLUserInfo(s.pgURL)
	if err != nil {
		return err
	}

	pool, err := database.NewPostgresDB(ctx, logger, dbURL, database.WithMaxConns(int32(s.maxConns)))
	if err != nil {
		return fmt.Errorf("connect to postgres db: %w", err)
	}

	s.pool = pool

	ps, err := pubsub.New(ctx, logger, s.pool, dbURL)
	if err != nil {
		return fmt.Errorf("initialize pubsub: %w", err)
	}
	s.ps = ps

	monitorCtx, monitorCancel := context.WithCancel(ctx)
	s.monitorCancel = monitorCancel
	go monitorPoolHealth(monitorCtx, logger, s.pool)

	return nil
}

func (s *Service) Service() *pgxpool.Pool {
	return s.pool
}

func (s *Service) Close(_ context.Context) error {
	if s.monitorCancel != nil {
		s.monitorCancel()
	}
	if s.pool != nil {
		s.pool.Close()
	}
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	dbname := services.ServerName
	if services.ServerName == "turtle" {
		dbname = "chronicle"
	}
	def := fmt.Sprintf("postgresql://postgres:postgres@localhost:5433/%s?sslmode=disable", dbname)
	return serpent.OptionSet{
		{
			Name:        "Postgres URL",
			Description: "Postgres URL to connect to.",
			Required:    false,
			Flag:        "postgres-url",
			Env:         "CHRONICLE_POSTGRES_URL",
			Default:     def,
			Value:       serpent.StringOf(&s.pgURL),
		},
		{
			Name: "Postgres Max Connections",
			Description: "Maximum number of connections in the Postgres pool. " +
				"The pool is shared by the API and all background workers, so this " +
				"bounds the whole process. A pool_max_conns in the Postgres URL " +
				"takes precedence. Set to 0 to use the pgx default.",
			Required: false,
			Flag:     "db-max-conns",
			Env:      "CHRONICLE_DB_MAX_CONNS",
			Default:  "20",
			Value:    serpent.Int64Of(&s.maxConns),
		},
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
