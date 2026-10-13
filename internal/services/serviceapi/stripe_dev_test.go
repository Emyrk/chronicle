package serviceapi

import (
	"testing"

	"github.com/stretchr/testify/require"
)

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
			wantErr: "requires a Supporter price ID",
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
