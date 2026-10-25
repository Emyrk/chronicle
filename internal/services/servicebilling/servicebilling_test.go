package servicebilling

import (
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/internal/billing"
	"github.com/stretchr/testify/require"
)

func TestHasConfiguredPrice(t *testing.T) {
	t.Parallel()
	require.False(t, (&Service{}).hasConfiguredPrice())
	require.True(t, (&Service{stripeHonoredPrices: []string{"price_honored"}}).hasConfiguredPrice())
	require.True(t, (&Service{stripeReveredPrices: []string{"price_revered"}}).hasConfiguredPrice())
	require.True(t, (&Service{stripeExaltedPrices: []string{"price_exalted"}}).hasConfiguredPrice())
}

func TestOptionsIncludeStripeConfiguration(t *testing.T) {
	t.Parallel()

	wanted := map[string]bool{
		"CHRONICLE_STRIPE_ACCOUNT_ID":        false,
		"CHRONICLE_STRIPE_HONORED_PRICE_IDS": false,
		"CHRONICLE_STRIPE_REVERED_PRICE_IDS": false,
		"CHRONICLE_STRIPE_EXALTED_PRICE_IDS": false,
	}
	for _, option := range (&Service{}).Options() {
		if _, ok := wanted[option.Env]; ok {
			wanted[option.Env] = true
		}
	}
	for env, found := range wanted {
		require.Truef(t, found, "missing option for %s", env)
	}
}

func TestValidateConfiguration(t *testing.T) {
	t.Parallel()

	complete := Service{
		stripeSecretKey:     "sk_test_example",
		stripeAccountID:     "acct_expected",
		stripeWebhookSecret: "whsec_example",
		stripeHonoredPrices: []string{"price_honored"},
	}
	tests := []struct {
		name        string
		service     Service
		accessURL   string
		wantEnabled bool
		wantErr     string
	}{
		{name: "disabled"},
		{
			name:      "missing secret key",
			service:   Service{stripeAccountID: complete.stripeAccountID, stripeWebhookSecret: complete.stripeWebhookSecret, stripeHonoredPrices: complete.stripeHonoredPrices},
			accessURL: "https://chronicle.example",
			wantErr:   "CHRONICLE_STRIPE_SECRET_KEY",
		},
		{
			name:      "missing account ID",
			service:   Service{stripeSecretKey: complete.stripeSecretKey, stripeWebhookSecret: complete.stripeWebhookSecret, stripeHonoredPrices: complete.stripeHonoredPrices},
			accessURL: "https://chronicle.example",
			wantErr:   "CHRONICLE_STRIPE_ACCOUNT_ID",
		},
		{
			name:      "missing webhook secret",
			service:   Service{stripeSecretKey: complete.stripeSecretKey, stripeAccountID: complete.stripeAccountID, stripeHonoredPrices: complete.stripeHonoredPrices},
			accessURL: "https://chronicle.example",
			wantErr:   "CHRONICLE_STRIPE_WEBHOOK_SECRET",
		},
		{
			name:      "missing tier price",
			service:   Service{stripeSecretKey: complete.stripeSecretKey, stripeAccountID: complete.stripeAccountID, stripeWebhookSecret: complete.stripeWebhookSecret},
			accessURL: "https://chronicle.example",
			wantErr:   "CHRONICLE_STRIPE_HONORED_PRICE_IDS",
		},
		{
			name:    "missing access URL",
			service: complete,
			wantErr: "CHRONICLE_ACCESS_URL",
		},
		{
			name:        "complete",
			service:     complete,
			accessURL:   "https://chronicle.example",
			wantEnabled: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			enabled, err := tt.service.validateConfiguration(tt.accessURL)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				require.False(t, enabled)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.wantEnabled, enabled)
		})
	}
}

func TestBillingEnabledRequiresValidatedReadiness(t *testing.T) {
	t.Parallel()

	accessURL := &url.URL{Scheme: "https", Host: "chronicle.example"}
	readyBilling := billing.New(billing.Options{
		SecretKey:       "sk_test_example",
		WebhookSecret:   "whsec_example",
		HonoredPriceIDs: []string{"price_honored"},
		AccessURL:       accessURL,
	})
	require.False(t, (&Service{stripeAccountID: "acct_expected"}).BillingEnabled())
	require.False(t, (&Service{Billing: readyBilling}).BillingEnabled())
	require.True(t, (&Service{stripeAccountID: "acct_expected", Billing: readyBilling}).BillingEnabled())

	invalidCatalog := billing.New(billing.Options{
		SecretKey:       "sk_test_example",
		WebhookSecret:   "whsec_example",
		HonoredPriceIDs: []string{"price_shared"},
		ReveredPriceIDs: []string{"price_shared"},
		AccessURL:       accessURL,
	})
	require.False(t, (&Service{stripeAccountID: "acct_expected", Billing: invalidCatalog}).BillingEnabled())
}

func TestDevStripeAPIKey(t *testing.T) {
	t.Parallel()

	service := Service{
		stripeSecretKey:     "sk_test_example",
		stripeReveredPrices: []string{"price_revered"},
	}
	key, err := service.devStripeAPIKey(true)
	require.NoError(t, err)
	require.Equal(t, "sk_test_example", key)

	_, err = service.devStripeAPIKey(false)
	require.ErrorContains(t, err, "requires dev auth")
}

func TestDevStripeWebhookSecretCompletesConfiguration(t *testing.T) {
	t.Parallel()

	service := Service{
		stripeSecretKey:     "sk_test_example",
		stripeAccountID:     "acct_expected",
		stripeHonoredPrices: []string{"price_honored"},
	}
	enabled, err := service.validateConfiguration("http://localhost:4000")
	require.False(t, enabled)
	require.ErrorContains(t, err, "CHRONICLE_STRIPE_WEBHOOK_SECRET")

	require.NoError(t, service.configureDevStripeWebhookSecret("whsec_example", true))
	enabled, err = service.validateConfiguration("http://localhost:4000")
	require.NoError(t, err)
	require.True(t, enabled)
}

func TestConfigureDevStripeWebhookSecret(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		service Service
		secret  string
		devAuth bool
		wantErr string
	}{
		{
			name:    "configured",
			devAuth: true,
			service: Service{stripeSecretKey: "sk_test_example", stripeHonoredPrices: []string{"price_honored"}},
			secret:  "whsec_example",
		},
		{
			name:    "requires dev auth",
			service: Service{stripeSecretKey: "sk_test_example", stripeReveredPrices: []string{"price_revered"}},
			secret:  "whsec_example",
			wantErr: "requires dev auth",
		},
		{
			name:    "rejects live key",
			devAuth: true,
			service: Service{stripeSecretKey: "sk_live_example", stripeExaltedPrices: []string{"price_exalted"}},
			secret:  "whsec_example",
			wantErr: "requires a sandbox secret key",
		},
		{
			name:    "requires price",
			devAuth: true,
			service: Service{stripeSecretKey: "sk_test_example"},
			secret:  "whsec_example",
			wantErr: "requires at least one tier price ID",
		},
		{
			name:    "rejects invalid webhook secret",
			devAuth: true,
			service: Service{stripeSecretKey: "sk_test_example", stripeReveredPrices: []string{"price_revered"}},
			secret:  "invalid",
			wantErr: "invalid webhook signing secret",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			service := tt.service
			err := service.configureDevStripeWebhookSecret(tt.secret, tt.devAuth)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.secret, service.stripeWebhookSecret)
		})
	}
}
