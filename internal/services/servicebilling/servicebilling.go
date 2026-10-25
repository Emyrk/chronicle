package servicebilling

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/coder/serpent"
)

const ReconciliationSchedule = 15 * time.Minute

var _ services.Servicer = (*Service)(nil)

func Billing(broker *services.Services) *billing.Service {
	return services.MustGet[*Service](broker).Billing
}

func BillingService(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func BillingEnabled(broker *services.Services) bool {
	return services.MustGet[*Service](broker).BillingEnabled()
}

func OnBilling() string { return (&Service{}).Name() }

func DevStripeAPIKey(broker *services.Services, devAuth bool) (string, error) {
	return services.MustGet[*Service](broker).devStripeAPIKey(devAuth)
}

func ConfigureDevStripeWebhookSecret(broker *services.Services, secret string, devAuth bool) error {
	return services.MustGet[*Service](broker).configureDevStripeWebhookSecret(secret, devAuth)
}

type Service struct {
	broker *services.Services

	stripeSecretKey     string
	stripeAccountID     string
	stripeWebhookSecret string
	stripeHonoredPrices []string
	stripeReveredPrices []string
	stripeExaltedPrices []string

	Billing *billing.Service
	Worker  *billing.ReconciliationWorker
}

func New(broker *services.Services) *Service { return &Service{broker: broker} }

func (s *Service) Name() string { return services.ServiceBilling }

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
		serviceauthz.OnAuthz(),
		serviceaccessurl.OnAccessURL(),
		serviceprometheus.OnPrometheus(),
	}
}

func (s *Service) Configures() []string { return []string{} }

func (s *Service) Start(ctx context.Context) error {
	var accessURL *url.URL
	if configuredAccessURL := serviceaccessurl.AccessURL(s.broker); configuredAccessURL != "" {
		parsed, err := url.Parse(configuredAccessURL)
		if err != nil {
			return err
		}
		accessURL = parsed
	}
	store := servicedbstore.DatabaseStore(s.broker)
	zed := serviceauthz.Authz(s.broker)
	metrics, err := billing.NewMetrics(serviceprometheus.Registry(s.broker))
	if err != nil {
		return err
	}
	s.Billing = billing.New(billing.Options{
		Store:                  store,
		StripeEntitlementRoles: zed,
		Metrics:                metrics,
		SecretKey:              s.stripeSecretKey,
		WebhookSecret:          s.stripeWebhookSecret,
		HonoredPriceIDs:        s.stripeHonoredPrices,
		ReveredPriceIDs:        s.stripeReveredPrices,
		ExaltedPriceIDs:        s.stripeExaltedPrices,
		AccessURL:              accessURL,
	})
	if err := s.Billing.ValidateAccount(ctx, s.stripeAccountID); err != nil {
		return err
	}
	s.Worker = &billing.ReconciliationWorker{
		Billing: s.Billing,
		Store:   store,
		Logger:  services.NamedLogger(servicelogger.Logger(s.broker), s.Name()),
	}
	return nil
}

func (s *Service) Close(context.Context) error { return nil }

func (s *Service) hasConfiguredPrice() bool {
	return len(s.stripeHonoredPrices) > 0 || len(s.stripeReveredPrices) > 0 || len(s.stripeExaltedPrices) > 0
}

func (s *Service) BillingEnabled() bool {
	return s != nil && s.stripeAccountID != ""
}

func (s *Service) devStripeAPIKey(devAuth bool) (string, error) {
	if !devAuth {
		return "", errors.New("development Stripe listener requires dev auth")
	}
	if !strings.HasPrefix(s.stripeSecretKey, "sk_test_") {
		return "", errors.New("development Stripe listener requires a sandbox secret key")
	}
	if !s.hasConfiguredPrice() {
		return "", errors.New("development Stripe listener requires at least one tier price ID")
	}
	return s.stripeSecretKey, nil
}

func (s *Service) configureDevStripeWebhookSecret(secret string, devAuth bool) error {
	if _, err := s.devStripeAPIKey(devAuth); err != nil {
		return err
	}
	if !strings.HasPrefix(secret, "whsec_") {
		return errors.New("stripe CLI returned an invalid webhook signing secret")
	}
	s.stripeWebhookSecret = secret
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Stripe Secret Key",
			Description: "Optional Stripe secret key. Billing is enabled when this, the webhook secret, and at least one tier price ID are configured.",
			Flag:        "stripe-secret-key",
			Env:         "CHRONICLE_STRIPE_SECRET_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.stripeSecretKey),
		},
		{
			Name:        "Stripe Account ID",
			Description: "Expected Stripe account ID for the configured secret key. Required when a Stripe secret key is configured.",
			Flag:        "stripe-account-id",
			Env:         "CHRONICLE_STRIPE_ACCOUNT_ID",
			Default:     "",
			Value:       serpent.StringOf(&s.stripeAccountID),
		},
		{
			Name:        "Stripe Webhook Secret",
			Description: "Optional Stripe webhook signing secret.",
			Flag:        "stripe-webhook-secret",
			Env:         "CHRONICLE_STRIPE_WEBHOOK_SECRET",
			Default:     "",
			Value:       serpent.StringOf(&s.stripeWebhookSecret),
		},
		{
			Name:        "Stripe Honored Price IDs",
			Description: "Optional comma-separated recurring Stripe price IDs for the Honored tier. Prices within the tier must belong to the same product, and all tiers must use the same currency.",
			Flag:        "stripe-honored-price-ids",
			Env:         "CHRONICLE_STRIPE_HONORED_PRICE_IDS",
			Default:     "",
			Value:       serpent.StringArrayOf(&s.stripeHonoredPrices),
		},
		{
			Name:        "Stripe Revered Price IDs",
			Description: "Optional comma-separated recurring Stripe price IDs for the Revered tier. Prices within the tier must belong to the same product, and all tiers must use the same currency.",
			Flag:        "stripe-revered-price-ids",
			Env:         "CHRONICLE_STRIPE_REVERED_PRICE_IDS",
			Default:     "",
			Value:       serpent.StringArrayOf(&s.stripeReveredPrices),
		},
		{
			Name:        "Stripe Exalted Price IDs",
			Description: "Optional comma-separated recurring Stripe price IDs for the Exalted tier. Prices within the tier must belong to the same product, and all tiers must use the same currency.",
			Flag:        "stripe-exalted-price-ids",
			Env:         "CHRONICLE_STRIPE_EXALTED_PRICE_IDS",
			Default:     "",
			Value:       serpent.StringArrayOf(&s.stripeExaltedPrices),
		},
	}
}
