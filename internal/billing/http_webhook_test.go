package billing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"github.com/stripe/stripe-go/v87"
	"github.com/stripe/stripe-go/v87/webhook"
)

type webhookStore struct {
	database.Store
	inserted []database.InsertBillingWebhookEventParams
	marked   []string
}

func (s *webhookStore) InsertBillingWebhookEvent(_ context.Context, arg database.InsertBillingWebhookEventParams) (int64, error) {
	s.inserted = append(s.inserted, arg)
	return 1, nil
}

func (s *webhookStore) MarkBillingWebhookEventProcessed(_ context.Context, eventID string) error {
	s.marked = append(s.marked, eventID)
	return nil
}

func TestWebhookAcceptsThinEventDestinationPing(t *testing.T) {
	t.Parallel()

	const (
		secret  = "whsec_test"
		eventID = "evt_ping"
	)
	body := `{
		"id":"` + eventID + `",
		"object":"v2.core.event",
		"type":"v2.core.event_destination.ping",
		"livemode":false,
		"created":"2026-10-25T15:55:51.155Z",
		"related_object":{"id":"ed_test","type":"v2.core.event_destination","url":"/v2/core/event_destinations/ed_test"}
	}`
	store := &webhookStore{}
	service := &Service{
		store:         store,
		stripe:        stripe.NewClient("sk_test_example"),
		webhookSecret: secret,
	}

	response := deliverSignedWebhook(t, service, body, secret)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, []database.InsertBillingWebhookEventParams{{
		StripeEventID: eventID,
		EventType:     "v2.core.event_destination.ping",
	}}, store.inserted)
	require.Equal(t, []string{eventID}, store.marked)
}

func TestWebhookStillAcceptsSnapshotEvents(t *testing.T) {
	t.Parallel()

	const (
		secret  = "whsec_test"
		eventID = "evt_snapshot"
	)
	body := `{
		"id":"` + eventID + `",
		"object":"event",
		"type":"unhandled.test.event",
		"api_version":"` + stripe.APIVersion + `",
		"data":{"object":{}}
	}`
	store := &webhookStore{}
	service := &Service{
		store:         store,
		stripe:        stripe.NewClient("sk_test_example"),
		webhookSecret: secret,
	}

	response := deliverSignedWebhook(t, service, body, secret)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, eventID, store.inserted[0].StripeEventID)
	require.Equal(t, "unhandled.test.event", store.inserted[0].EventType)
	require.Equal(t, []string{eventID}, store.marked)
}

func TestWebhookRejectsInvalidSignatureBeforeRecording(t *testing.T) {
	t.Parallel()

	store := &webhookStore{}
	service := &Service{
		store:         store,
		stripe:        stripe.NewClient("sk_test_example"),
		webhookSecret: "whsec_expected",
	}

	response := deliverSignedWebhook(t, service, `{"id":"evt_ping","object":"v2.core.event","type":"v2.core.event_destination.ping"}`, "whsec_wrong")

	require.Equal(t, http.StatusBadRequest, response.Code)
	require.Contains(t, response.Body.String(), "Invalid webhook signature.")
	require.Empty(t, store.inserted)
	require.Empty(t, store.marked)
}

func deliverSignedWebhook(t *testing.T, service *Service, body, secret string) *httptest.ResponseRecorder {
	t.Helper()

	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{
		Payload: []byte(body),
		Secret:  secret,
	})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/billing/webhook", strings.NewReader(body))
	request.Header.Set("Stripe-Signature", signed.Header)
	response := httptest.NewRecorder()
	service.Webhook(response, request)
	return response
}
