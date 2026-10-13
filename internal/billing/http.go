package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v87"
	"github.com/stripe/stripe-go/v87/webhook"
)

const maxWebhookBody = 1 << 20

func (s *Service) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	if !s.Enabled() {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Billing is not configured."})
		return
	}
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	if sub, err := s.store.GetBillingSubscriptionByUserID(r.Context(), claims.Subject); err == nil && subscriptionIsAdFree(time.Now(), sub) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "You already have an active subscription."})
		return
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}

	user, err := s.store.GetUserByID(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	success := s.accessURL.ResolveReference(&url.URL{Path: "/account", RawQuery: "billing=success"}).String()
	cancel := s.accessURL.ResolveReference(&url.URL{Path: "/account", RawQuery: "billing=cancel"}).String()
	params := &stripe.CheckoutSessionCreateParams{
		ClientReferenceID: stripe.String(claims.Subject.String()),
		CustomerEmail:     stripe.String(user.Email),
		LineItems: []*stripe.CheckoutSessionCreateLineItemParams{{
			Price:    stripe.String(s.priceID),
			Quantity: stripe.Int64(1),
		}},
		ManagedPayments: &stripe.CheckoutSessionCreateManagedPaymentsParams{Enabled: stripe.Bool(true)},
		Mode:            stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		SuccessURL:      stripe.String(success),
		CancelURL:       stripe.String(cancel),
		SubscriptionData: &stripe.CheckoutSessionCreateSubscriptionDataParams{Metadata: map[string]string{
			"chronicle_user_id": claims.Subject.String(),
			"chronicle_tier":    TierSupporter,
		}},
	}
	session, err := s.stripe.V1CheckoutSessions.Create(r.Context(), params)
	if err != nil {
		httpapi.InternalServerError(w, fmt.Errorf("create Stripe Checkout session: %w", err))
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.BillingCheckoutResponse{URL: session.URL})
}

func (s *Service) CreatePortal(w http.ResponseWriter, r *http.Request) {
	if !s.Enabled() {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Billing is not configured."})
		return
	}
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	sub, err := s.store.GetBillingSubscriptionByUserID(r.Context(), claims.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "No billing account was found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	portal, err := s.stripe.V1BillingPortalSessions.Create(r.Context(), &stripe.BillingPortalSessionCreateParams{
		Customer:  stripe.String(sub.StripeCustomerID),
		ReturnURL: stripe.String(s.accessURL.ResolveReference(&url.URL{Path: "/account"}).String()),
	})
	if err != nil {
		httpapi.InternalServerError(w, fmt.Errorf("create Stripe portal session: %w", err))
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.BillingCheckoutResponse{URL: portal.URL})
}

func (s *Service) Summary(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	adFree, err := s.IsAdFree(r.Context(), claims.Subject, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result := chroniclesdk.BillingSummary{Enabled: s.Enabled(), Tier: TierFree, AdsFree: adFree}
	if adFree {
		result.Tier = TierSupporter
	}
	if sub, err := s.store.GetBillingSubscriptionByUserID(r.Context(), claims.Subject); err == nil {
		result.Status = sub.Status
		result.CancelAtPeriodEnd = sub.CancelAtPeriodEnd
		if sub.CurrentPeriodEnd.Valid {
			result.CurrentPeriodEnd = &sub.CurrentPeriodEnd.Time
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}

func (s *Service) GrantMonthsHTTP(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid user ID."})
		return
	}
	var req chroniclesdk.AdminGrantBillingMonthsRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	grant, err := s.GrantMonths(r.Context(), userID, claims.Subject, req.Months, req.Reason)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}
	httpapi.Write(r.Context(), w, http.StatusCreated, chroniclesdk.AdminGrantBillingMonthsResponse{
		Tier:      grant.Tier,
		StartsAt:  grant.StartsAt.Time,
		ExpiresAt: grant.ExpiresAt.Time,
		Months:    grant.Months,
		Reason:    grant.Reason,
	})
}

func (s *Service) Webhook(w http.ResponseWriter, r *http.Request) {
	if s.webhookSecret == "" {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Not found."})
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWebhookBody))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid webhook body."})
		return
	}
	event, err := webhook.ConstructEvent(body, r.Header.Get("Stripe-Signature"), s.webhookSecret)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid webhook signature."})
		return
	}
	inserted, err := s.store.InsertBillingWebhookEvent(r.Context(), database.InsertBillingWebhookEventParams{
		StripeEventID: event.ID,
		EventType:     string(event.Type),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if inserted == 0 {
		stored, err := s.store.GetBillingWebhookEvent(r.Context(), event.ID)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if stored.ProcessedAt.Valid {
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	if err := s.processEvent(r.Context(), event); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if err := s.store.MarkBillingWebhookEventProcessed(r.Context(), event.ID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Service) processEvent(ctx context.Context, event stripe.Event) error {
	switch event.Type {
	case stripe.EventTypeCheckoutSessionCompleted:
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
			return fmt.Errorf("decode checkout session: %w", err)
		}
		userID, err := uuid.Parse(session.ClientReferenceID)
		if err != nil || session.Subscription == nil {
			return fmt.Errorf("checkout session missing Chronicle user or subscription")
		}
		sub, err := s.stripe.V1Subscriptions.Retrieve(ctx, session.Subscription.ID, nil)
		if err != nil {
			return fmt.Errorf("retrieve subscription: %w", err)
		}
		return s.upsertSubscription(ctx, userID, sub)
	case stripe.EventTypeCustomerSubscriptionCreated, stripe.EventTypeCustomerSubscriptionUpdated, stripe.EventTypeCustomerSubscriptionDeleted:
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return fmt.Errorf("decode subscription: %w", err)
		}
		row, err := s.store.GetBillingSubscriptionByStripeID(ctx, pgtype.Text{String: sub.ID, Valid: true})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("find subscription owner: %w", err)
		}
		return s.upsertSubscription(ctx, row.UserID, &sub)
	default:
		return nil
	}
}

func (s *Service) upsertSubscription(ctx context.Context, userID uuid.UUID, sub *stripe.Subscription) error {
	if sub.Customer == nil {
		return fmt.Errorf("subscription missing customer")
	}
	var periodEnd pgtype.Timestamptz
	if sub.Items != nil {
		for _, item := range sub.Items.Data {
			if item.CurrentPeriodEnd > periodEnd.Time.Unix() {
				periodEnd = pgtype.Timestamptz{Time: time.Unix(item.CurrentPeriodEnd, 0), Valid: true}
			}
		}
	}
	_, err := s.store.UpsertBillingSubscription(ctx, database.UpsertBillingSubscriptionParams{
		UserID:               userID,
		StripeCustomerID:     sub.Customer.ID,
		StripeSubscriptionID: pgtype.Text{String: sub.ID, Valid: true},
		Tier:                 TierSupporter,
		Status:               string(sub.Status),
		CurrentPeriodEnd:     periodEnd,
		CancelAtPeriodEnd:    sub.CancelAtPeriodEnd,
	})
	if err != nil {
		return fmt.Errorf("upsert billing subscription: %w", err)
	}
	return nil
}
