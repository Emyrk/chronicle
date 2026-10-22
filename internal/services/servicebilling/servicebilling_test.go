package servicebilling

import (
	"testing"

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

func TestBillingEnabledRequiresStripeAccountID(t *testing.T) {
	t.Parallel()

	require.False(t, (&Service{}).BillingEnabled())
	require.True(t, (&Service{stripeAccountID: "acct_expected"}).BillingEnabled())
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
