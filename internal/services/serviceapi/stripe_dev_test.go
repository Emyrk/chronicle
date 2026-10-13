package serviceapi

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

func TestConfigureDevStripeWebhookSecret(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		service Service
		secret  string
		wantErr string
	}{
		{
			name: "configured",
			service: Service{
				devAuth:              true,
				stripeSecretKey:      "sk_test_example",
				stripeSupporterPrice: "price_supporter",
			},
			secret: "whsec_example",
		},
		{
			name: "configured with multiple prices",
			service: Service{
				devAuth:               true,
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
			name: "rejects live key",
			service: Service{
				devAuth:              true,
				stripeSecretKey:      "sk_live_example",
				stripeSupporterPrice: "price_supporter",
			},
			secret:  "whsec_example",
			wantErr: "requires a sandbox secret key",
		},
		{
			name: "requires price",
			service: Service{
				devAuth:         true,
				stripeSecretKey: "sk_test_example",
			},
			secret:  "whsec_example",
			wantErr: "requires at least one Supporter price ID",
		},
		{
			name: "rejects invalid webhook secret",
			service: Service{
				devAuth:              true,
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
			err := service.configureDevStripeWebhookSecret(tt.secret)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.secret, service.stripeWebhookSecret)
		})
	}
}
