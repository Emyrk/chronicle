package servicestripecli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os/exec"
	"regexp"
	"strings"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceapi"
	"github.com/Emyrk/chronicle/internal/services/servicebilling"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

const (
	defaultAccessURL = "http://localhost:4000"
	webhookPath      = "/api/v1/billing/webhook"
)

var webhookSecretPattern = regexp.MustCompile(`whsec_[A-Za-z0-9_]+`)

var eventTypes = []string{
	"checkout.session.completed",
	"entitlements.active_entitlement_summary.updated",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
}

type commandFactory func(context.Context, string, ...string) *exec.Cmd

type Service struct {
	broker *services.Services

	enabled    bool
	executable string

	lookPath               func(string) (string, error)
	command                commandFactory
	accessURL              func(*services.Services) string
	configureWebhookSecret func(*services.Services, string) error
	logger                 *slog.Logger

	listenerCtx    context.Context
	listenerCancel context.CancelFunc
	listenerDone   chan error
}

func New(broker *services.Services) *Service {
	return &Service{
		broker:     broker,
		executable: "stripe",
		lookPath:   exec.LookPath,
		command:    exec.CommandContext,
		accessURL:  serviceaccessurl.AccessURL,
		configureWebhookSecret: func(broker *services.Services, secret string) error {
			return servicebilling.ConfigureDevStripeWebhookSecret(broker, secret, serviceapi.DevAuth(broker))
		},
	}
}

func (s *Service) Name() string { return services.ServiceStripeCLI }

func (s *Service) Configures() []string {
	return []string{servicebilling.OnBilling(), serviceapi.OnAPI()}
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		serviceaccessurl.OnAccessURL(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	if !s.enabled {
		return nil
	}

	logger := s.logger
	if logger == nil {
		logger = services.NamedLogger(servicelogger.Logger(s.broker), s.Name())
	}

	executable, err := s.lookPath(s.executable)
	if err != nil {
		return fmt.Errorf("find Stripe CLI: %w", err)
	}
	forwardTo, err := localWebhookURL(s.accessURL(s.broker))
	if err != nil {
		return err
	}

	secretOutput, err := s.command(ctx, executable, "listen", "--skip-update", "--color", "off", "--print-secret").CombinedOutput()
	if err != nil {
		return fmt.Errorf("read Stripe CLI webhook secret: %w: %s", err, redactWebhookSecrets(strings.TrimSpace(string(secretOutput))))
	}
	secret, err := parseWebhookSecret(secretOutput)
	if err != nil {
		return err
	}
	if err := s.configureWebhookSecret(s.broker, secret); err != nil {
		return fmt.Errorf("configure Stripe webhook secret: %w", err)
	}

	s.listenerCtx, s.listenerCancel = context.WithCancel(ctx)
	cmd := s.command(
		s.listenerCtx,
		executable,
		"listen",
		"--skip-update",
		"--color", "off",
		"--events", strings.Join(eventTypes, ","),
		"--forward-to", forwardTo,
	)
	// Stripe CLI can announce the webhook signing secret on either output
	// stream. Discard both so the automatically discovered secret never lands
	// in Chronicle logs.
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		s.listenerCancel()
		return fmt.Errorf("start Stripe CLI listener: %w", err)
	}

	s.listenerDone = make(chan error, 1)
	go func() {
		err := cmd.Wait()
		s.listenerDone <- err
		if s.listenerCtx.Err() == nil {
			if err != nil {
				logger.Error("Stripe CLI listener exited", slog.String("error", err.Error()))
			} else {
				logger.Warn("Stripe CLI listener exited")
			}
		}
	}()

	logger.Info("Stripe CLI listener started", slog.String("forward_to", forwardTo))
	return nil
}

func (s *Service) Close(ctx context.Context) error {
	if s.listenerCancel == nil {
		return nil
	}

	s.listenerCancel()
	select {
	case <-s.listenerDone:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("stop Stripe CLI listener: %w", ctx.Err())
	}
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Development Stripe Listener",
			Description: "Run Stripe CLI and forward sandbox billing events to the local webhook endpoint. Requires --dev-auth, a sandbox Stripe key, a Supporter price ID, and an authenticated Stripe CLI.",
			Required:    false,
			Flag:        "dev-stripe-listen",
			Env:         "CHRONICLE_DEV_STRIPE_LISTEN",
			Default:     "false",
			Value:       serpent.BoolOf(&s.enabled),
		},
	}
}

func localWebhookURL(accessURL string) (string, error) {
	if accessURL == "" {
		accessURL = defaultAccessURL
	}
	u, err := url.Parse(accessURL)
	if err != nil {
		return "", fmt.Errorf("parse local access URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("development Stripe listener requires an HTTP access URL")
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1":
	default:
		return "", fmt.Errorf("development Stripe listener requires a localhost access URL, got %q", accessURL)
	}
	u.Path = webhookPath
	u.RawPath = ""
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func redactWebhookSecrets(output string) string {
	return webhookSecretPattern.ReplaceAllString(output, "[REDACTED]")
}

func parseWebhookSecret(output []byte) (string, error) {
	for _, field := range strings.Fields(string(output)) {
		if strings.HasPrefix(field, "whsec_") {
			return field, nil
		}
	}
	return "", errors.New("stripe CLI did not return a webhook signing secret")
}
