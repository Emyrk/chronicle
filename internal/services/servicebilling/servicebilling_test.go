package servicebilling

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSupporterPriceIDsPrefersPluralConfiguration(t *testing.T) {
	t.Parallel()

	s := Service{
		stripeSupporterPrice:  "price_legacy",
		stripeSupporterPrices: []string{"price_monthly", "price_annual"},
	}
	require.Equal(t, []string{"price_monthly", "price_annual"}, s.supporterPriceIDs())
}

func TestOptionsIncludeStripeAccountID(t *testing.T) {
	t.Parallel()

	var found bool
	for _, option := range (&Service{}).Options() {
		if option.Env == "CHRONICLE_STRIPE_ACCOUNT_ID" {
			found = true
			break
		}
	}
	require.True(t, found)
}

func TestBillingEnabledRequiresStripeAccountID(t *testing.T) {
	t.Parallel()

	require.False(t, (&Service{}).BillingEnabled())
	require.True(t, (&Service{stripeAccountID: "acct_expected"}).BillingEnabled())
}

func TestDevStripeAPIKey(t *testing.T) {
	t.Parallel()

	service := Service{
		stripeSecretKey:      "sk_test_example",
		stripeSupporterPrice: "price_supporter",
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
			service: Service{
				stripeSecretKey:      "sk_test_example",
				stripeSupporterPrice: "price_supporter",
			},
			secret: "whsec_example",
		},
		{
			name:    "configured with multiple prices",
			devAuth: true,
			service: Service{
				stripeSecretKey:       "sk_test_example",
				stripeSupporterPrices: []string{"price_monthly", "price_annual"},
			},
			secret: "whsec_example",
		},
		{
			name: "requires dev auth",
			service: Service{
				stripeSecretKey:      "sk_test_example",
				stripeSupporterPrice: "price_supporter",
			},
			secret:  "whsec_example",
			wantErr: "requires dev auth",
		},
		{
			name:    "rejects live key",
			devAuth: true,
			service: Service{
				stripeSecretKey:      "sk_live_example",
				stripeSupporterPrice: "price_supporter",
			},
			secret:  "whsec_example",
			wantErr: "requires a sandbox secret key",
		},
		{
			name:    "requires price",
			devAuth: true,
			service: Service{
				stripeSecretKey: "sk_test_example",
			},
			secret:  "whsec_example",
			wantErr: "requires at least one Supporter price ID",
		},
		{
			name:    "rejects invalid webhook secret",
			devAuth: true,
			service: Service{
				stripeSecretKey:      "sk_test_example",
				stripeSupporterPrice: "price_supporter",
			},
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
