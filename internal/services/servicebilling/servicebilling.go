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

	stripeSecretKey       string
	stripeAccountID       string
	stripeWebhookSecret   string
	stripeSupporterPrice  string
	stripeSupporterPrices []string

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
	s.Billing = billing.New(billing.Options{
		Store:                  store,
		StripeEntitlementRoles: zed,
		SecretKey:              s.stripeSecretKey,
		WebhookSecret:          s.stripeWebhookSecret,
		PriceIDs:               s.supporterPriceIDs(),
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

func (s *Service) supporterPriceIDs() []string {
	if len(s.stripeSupporterPrices) > 0 {
		return append([]string(nil), s.stripeSupporterPrices...)
	}
	if s.stripeSupporterPrice != "" {
		return []string{s.stripeSupporterPrice}
	}
	return nil
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
	if len(s.supporterPriceIDs()) == 0 {
		return "", errors.New("development Stripe listener requires at least one Supporter price ID")
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
			Description: "Optional Stripe secret key. Billing is enabled when this, the webhook secret, and at least one Supporter price ID are configured.",
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
			Name:        "Stripe Supporter Price IDs",
			Description: "Optional comma-separated recurring Stripe price IDs for the ad-free Supporter tier. Prices must belong to one product and currency.",
			Flag:        "stripe-supporter-price-ids",
			Env:         "CHRONICLE_STRIPE_SUPPORTER_PRICE_IDS",
			Default:     "",
			Value:       serpent.StringArrayOf(&s.stripeSupporterPrices),
		},
		{
			Name:        "Stripe Supporter Price ID",
			Description: "Optional single recurring Stripe price ID retained for backward compatibility.",
			Flag:        "stripe-supporter-price-id",
			Env:         "CHRONICLE_STRIPE_SUPPORTER_PRICE_ID",
			Default:     "",
			Value:       serpent.StringOf(&s.stripeSupporterPrice),
		},
	}
}
