package pgxpoolservice

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"regexp"
	"strings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"golang.org/x/xerrors"

	"github.com/coder/serpent"
)

const ServiceName = "database"

type Service struct {
	logger *slog.Logger
	reg    *prometheus.Registry

	pgURL string

	pool *pgxpool.Pool
}

func New(logger *slog.Logger, reg *prometheus.Registry) *Service {
	return &Service{
		logger: services.NamedLogger(logger, ServiceName),
		reg:    reg,
	}
}

func (s *Service) Name() string {
	return ServiceName
}
func (s *Service) DependsOn() []string {
	return []string{}
}

func (s *Service) Start(ctx context.Context) error {
	dbURL, err := escapePostgresURLUserInfo(s.pgURL)
	if err != nil {
		return err
	}

	pool, err := database.NewPostgresDB(ctx, s.logger, dbURL)
	if err != nil {
		return fmt.Errorf("connect to postgres db: %w", err)
	}

	s.pool = pool

	return nil
}

func (s *Service) Service() *pgxpool.Pool {
	return s.pool
}

func (s *Service) Close() error {
	s.pool.Close()
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Postgres URL",
			Description: "Postgres URL to connect to.",
			Required:    false,
			Flag:        "postgres-url",
			Env:         "CHRONICLE_POSTGRES_URL",
			Default:     "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable",
			Value:       serpent.StringOf(&s.pgURL),
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
