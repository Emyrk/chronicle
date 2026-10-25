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
	var req chroniclesdk.BillingCheckoutRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	operationID, err := uuid.Parse(req.OperationID)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid checkout operation."})
		return
	}
	selectedProduct, priceAllowed := s.productForPrice(req.PriceID)
	if !priceAllowed {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid billing price."})
		return
	}
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	var providerCustomerID string
	if sub, err := s.store.GetBillingSubscriptionByUserID(r.Context(), claims.Subject); err == nil {
		if sub.Provider == ProviderStripe {
			providerCustomerID = sub.ProviderCustomerID
		}
		_, hasPaidEntitlement, err := s.paidTier(r.Context(), claims.Subject)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if subscriptionBlocksCheckout(time.Now(), sub, hasPaidEntitlement) {
			httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "You already have an active subscription."})
			return
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}

	user, err := s.store.GetUserByID(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	success := s.accessURL.ResolveReference(&url.URL{Path: "/account/billing", RawQuery: "billing=success"}).String()
	cancel := s.accessURL.ResolveReference(&url.URL{Path: "/account/billing", RawQuery: "billing=cancel"}).String()
	params := &stripe.CheckoutSessionCreateParams{
		ClientReferenceID: stripe.String(claims.Subject.String()),
		LineItems: []*stripe.CheckoutSessionCreateLineItemParams{{
			Price:    stripe.String(req.PriceID),
			Quantity: stripe.Int64(1),
		}},
		ManagedPayments: &stripe.CheckoutSessionCreateManagedPaymentsParams{Enabled: stripe.Bool(true)},
		Mode:            stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		SuccessURL:      stripe.String(success),
		CancelURL:       stripe.String(cancel),
		SubscriptionData: &stripe.CheckoutSessionCreateSubscriptionDataParams{Metadata: map[string]string{
			"chronicle_user_id":      claims.Subject.String(),
			"chronicle_product_code": string(selectedProduct),
			"chronicle_price_id":     req.PriceID,
		}},
	}
	params.SetIdempotencyKey(fmt.Sprintf("chronicle-checkout:%s:%s", claims.Subject, operationID))
	if providerCustomerID != "" {
		params.Customer = stripe.String(providerCustomerID)
	} else {
		params.CustomerEmail = stripe.String(user.Email)
	}
	session, err := s.createCheckoutSession(r.Context(), params)
	if err != nil {
		httpapi.InternalServerError(w, fmt.Errorf("create Stripe Checkout session: %w", err))
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.BillingCheckoutResponse{URL: session.URL})
}

func (s *Service) CreatePortal(w http.ResponseWriter, r *http.Request) {
	s.createPortal(w, r, "")
}

// CreateChangePortal opens the Stripe portal directly on the subscription plan picker.
func (s *Service) CreateChangePortal(w http.ResponseWriter, r *http.Request) {
	s.createPortal(w, r, stripe.BillingPortalSessionFlowTypeSubscriptionUpdate)
}

// CreateCancelPortal opens the Stripe portal directly on the subscription
// cancellation confirmation, returning to /account/billing afterwards.
func (s *Service) CreateCancelPortal(w http.ResponseWriter, r *http.Request) {
	s.createPortal(w, r, stripe.BillingPortalSessionFlowTypeSubscriptionCancel)
}

func (s *Service) createPortal(w http.ResponseWriter, r *http.Request, flowType stripe.BillingPortalSessionFlowType) {
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
	params := &stripe.BillingPortalSessionCreateParams{
		Customer:  stripe.String(sub.ProviderCustomerID),
		ReturnURL: stripe.String(s.accessURL.ResolveReference(&url.URL{Path: "/account/billing"}).String()),
	}
	if flowType != "" {
		// A plan change lands before the Stripe webhook updates the tier, so
		// tell the billing page to show a pending notice and poll.
		afterCompletionQuery := ""
		if flowType == stripe.BillingPortalSessionFlowTypeSubscriptionUpdate {
			afterCompletionQuery = "billing=updated"
		}
		if !sub.ProviderSubscriptionID.Valid {
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "No active subscription was found."})
			return
		}
		params.FlowData = &stripe.BillingPortalSessionCreateFlowDataParams{
			Type: stripe.String(string(flowType)),
			AfterCompletion: &stripe.BillingPortalSessionCreateFlowDataAfterCompletionParams{
				Type: stripe.String(string(stripe.BillingPortalSessionFlowAfterCompletionTypeRedirect)),
				Redirect: &stripe.BillingPortalSessionCreateFlowDataAfterCompletionRedirectParams{
					ReturnURL: stripe.String(s.accessURL.ResolveReference(&url.URL{Path: "/account/billing", RawQuery: afterCompletionQuery}).String()),
				},
			},
		}
		switch flowType {
		case stripe.BillingPortalSessionFlowTypeSubscriptionCancel:
			params.FlowData.SubscriptionCancel = &stripe.BillingPortalSessionCreateFlowDataSubscriptionCancelParams{
				Subscription: stripe.String(sub.ProviderSubscriptionID.String),
			}
		case stripe.BillingPortalSessionFlowTypeSubscriptionUpdate:
			params.FlowData.SubscriptionUpdate = &stripe.BillingPortalSessionCreateFlowDataSubscriptionUpdateParams{
				Subscription: stripe.String(sub.ProviderSubscriptionID.String),
			}
		}
	}
	portal, err := s.createBillingPortalSession(r.Context(), params)
	if err != nil {
		httpapi.InternalServerError(w, fmt.Errorf("create Stripe portal session: %w", err))
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.BillingCheckoutResponse{URL: portal.URL})
}

func (s *Service) Summary(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	tier, hasPaidEntitlement, err := s.paidTier(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result := chroniclesdk.BillingSummary{Enabled: s.Enabled(), Tier: tier, AdsFree: hasPaidEntitlement}
	if sub, err := s.store.GetBillingSubscriptionByUserID(r.Context(), claims.Subject); err == nil {
		result.HasBillingAccount = true
		result.HasSubscription = subscriptionHasCurrentBillingState(sub, hasPaidEntitlement)
		result.CanCheckout = !subscriptionBlocksCheckout(time.Now(), sub, hasPaidEntitlement)
		result.Status = sub.Status
		result.CancelAtPeriodEnd = sub.CancelAtPeriodEnd
		result.CustomerID = sub.ProviderCustomerID
		if !hasPaidEntitlement && isPaidProduct(ProductCode(sub.ProductCode)) {
			result.Tier = tierForProduct(ProductCode(sub.ProductCode))
		}
		if sub.CancelAt.Valid {
			cancelAt := sub.CancelAt.Time
			result.CancelAt = &cancelAt
		}
		if sub.CurrentPeriodEnd.Valid {
			result.CurrentPeriodEnd = &sub.CurrentPeriodEnd.Time
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	entitlements, err := s.store.ListBillingEntitlementsByUserID(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result.Entitlements = make([]string, 0, len(entitlements))
	for _, entitlement := range entitlements {
		result.Entitlements = append(result.Entitlements, entitlement.EntitlementKey)
	}
	if !result.HasBillingAccount {
		result.CanCheckout = true
	}
	// Subscribers also get prices so the tier picker can preview a plan change.
	if result.Enabled && (result.CanCheckout || result.HasSubscription) {
		result.Prices, err = s.billingPrices(r.Context())
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}

func (s *Service) AdminActivity(w http.ResponseWriter, r *http.Request) {
	runs, err := s.store.ListRecentBillingReconciliationRuns(r.Context(), 50)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	webhooks, err := s.store.ListRecentBillingWebhookEvents(r.Context(), 100)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	subscriptions, err := s.store.ListRecentBillingSubscriptions(r.Context(), 100)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result := chroniclesdk.AdminBillingActivityResponse{
		ReconciliationRuns: make([]chroniclesdk.AdminBillingReconciliationRun, 0, len(runs)),
		WebhookDeliveries:  make([]chroniclesdk.AdminBillingWebhookDelivery, 0, len(webhooks)),
		Subscriptions:      make([]chroniclesdk.AdminBillingSubscription, 0, len(subscriptions)),
	}
	for _, run := range runs {
		item := chroniclesdk.AdminBillingReconciliationRun{
			ID:                          run.ID.String(),
			Status:                      run.Status,
			StartedAt:                   run.StartedAt.Time,
			ProviderCustomersFound:      run.ProviderCustomersFound,
			LocalSubscriptionsFound:     run.LocalSubscriptionsFound,
			SubscriptionsSeen:           run.SubscriptionsSeen,
			SubscriptionsChanged:        run.SubscriptionsChanged,
			SubscriptionsSkippedInvalid: run.SubscriptionsSkippedInvalid,
			EntitlementCustomersFound:   run.EntitlementCustomersFound,
			EntitlementCustomersSynced:  run.EntitlementCustomersSynced,
			ErrorText:                   run.ErrorText,
		}
		if run.CompletedAt.Valid {
			completedAt := run.CompletedAt.Time
			item.CompletedAt = &completedAt
		}
		result.ReconciliationRuns = append(result.ReconciliationRuns, item)
	}
	for _, delivery := range webhooks {
		item := chroniclesdk.AdminBillingWebhookDelivery{
			StripeEventID: delivery.StripeEventID,
			EventType:     delivery.EventType,
			ReceivedAt:    delivery.ReceivedAt.Time,
		}
		if delivery.ProcessedAt.Valid {
			processedAt := delivery.ProcessedAt.Time
			item.ProcessedAt = &processedAt
		}
		result.WebhookDeliveries = append(result.WebhookDeliveries, item)
	}
	for _, sub := range subscriptions {
		item := chroniclesdk.AdminBillingSubscription{
			UserID:                 sub.UserID.String(),
			Provider:               sub.Provider,
			ProviderCustomerID:     sub.ProviderCustomerID,
			ProviderSubscriptionID: sub.ProviderSubscriptionID.String,
			ProviderProductID:      sub.ProviderProductID.String,
			ProviderPriceID:        sub.ProviderPriceID.String,
			ProductCode:            sub.ProductCode,
			Status:                 sub.Status,
			CancelAtPeriodEnd:      sub.CancelAtPeriodEnd,
			UpdatedAt:              sub.UpdatedAt.Time,
		}
		if sub.CancelAt.Valid {
			cancelAt := sub.CancelAt.Time
			item.CancelAt = &cancelAt
		}
		if sub.CurrentPeriodEnd.Valid {
			periodEnd := sub.CurrentPeriodEnd.Time
			item.CurrentPeriodEnd = &periodEnd
		}
		result.Subscriptions = append(result.Subscriptions, item)
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
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

func (s *Service) retrieveAuthoritativeSubscription(ctx context.Context, subscriptionID string) (*stripe.Subscription, error) {
	if s.retrieveSubscription == nil {
		return nil, fmt.Errorf("stripe subscription retrieval is not configured")
	}
	return s.retrieveSubscription(ctx, subscriptionID, nil)
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
		sub, err := s.retrieveAuthoritativeSubscription(ctx, session.Subscription.ID)
		if err != nil {
			return fmt.Errorf("retrieve subscription: %w", err)
		}
		if err := s.upsertSubscription(ctx, userID, sub); err != nil {
			return err
		}
		return s.syncStripeEntitlementsIfConfigured(ctx, sub.Customer.ID)
	case stripe.EventTypeEntitlementsActiveEntitlementSummaryUpdated:
		var summary stripe.EntitlementsActiveEntitlementSummary
		if err := json.Unmarshal(event.Data.Raw, &summary); err != nil {
			return fmt.Errorf("decode active entitlement summary: %w", err)
		}
		customerID, err := stripeEntitlementCustomer(summary)
		if err != nil {
			return err
		}
		return s.syncStripeEntitlements(ctx, customerID)
	case stripe.EventTypeCustomerSubscriptionCreated, stripe.EventTypeCustomerSubscriptionUpdated, stripe.EventTypeCustomerSubscriptionDeleted:
		var snapshot stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &snapshot); err != nil {
			return fmt.Errorf("decode subscription: %w", err)
		}
		if snapshot.ID == "" {
			return fmt.Errorf("subscription event missing subscription ID")
		}
		sub, err := s.retrieveAuthoritativeSubscription(ctx, snapshot.ID)
		if err != nil {
			if event.Type == stripe.EventTypeCustomerSubscriptionDeleted && stripeResourceMissing(err) {
				customerID, cancelErr := s.markSubscriptionCanceled(ctx, snapshot.ID)
				if cancelErr != nil {
					return cancelErr
				}
				return s.syncStripeEntitlementsIfConfigured(ctx, customerID)
			}
			return fmt.Errorf("retrieve subscription %q: %w", snapshot.ID, err)
		}
		userID, err := s.subscriptionOwner(ctx, sub)
		if err != nil {
			return err
		}
		if err := s.upsertSubscription(ctx, userID, sub); err != nil {
			return err
		}
		return s.syncStripeEntitlementsIfConfigured(ctx, sub.Customer.ID)
	default:
		return nil
	}
}

func stripeResourceMissing(err error) bool {
	var stripeErr *stripe.Error
	return errors.As(err, &stripeErr) && stripeErr.Code == stripe.ErrorCodeResourceMissing
}

func (s *Service) subscriptionOwner(ctx context.Context, sub *stripe.Subscription) (uuid.UUID, error) {
	if sub == nil || sub.ID == "" {
		return uuid.Nil, fmt.Errorf("subscription is missing")
	}
	userID, userErr := uuid.Parse(sub.Metadata["chronicle_user_id"])
	if userErr == nil {
		return userID, nil
	}
	row, err := s.store.GetBillingSubscriptionByProviderID(ctx, database.GetBillingSubscriptionByProviderIDParams{
		Provider:               ProviderStripe,
		ProviderSubscriptionID: pgtype.Text{String: sub.ID, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, fmt.Errorf("subscription %q has invalid Chronicle metadata and no local row", sub.ID)
		}
		return uuid.Nil, fmt.Errorf("find subscription owner: %w", err)
	}
	return row.UserID, nil
}

func (s *Service) markSubscriptionCanceled(ctx context.Context, subscriptionID string) (string, error) {
	row, err := s.store.GetBillingSubscriptionByProviderID(ctx, database.GetBillingSubscriptionByProviderIDParams{
		Provider:               ProviderStripe,
		ProviderSubscriptionID: pgtype.Text{String: subscriptionID, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("find deleted subscription: %w", err)
	}
	_, err = s.store.UpsertBillingSubscription(ctx, database.UpsertBillingSubscriptionParams{
		UserID:                 row.UserID,
		Provider:               row.Provider,
		ProviderCustomerID:     row.ProviderCustomerID,
		ProviderSubscriptionID: row.ProviderSubscriptionID,
		ProviderProductID:      row.ProviderProductID,
		ProviderPriceID:        row.ProviderPriceID,
		ProductCode:            row.ProductCode,
		Status:                 string(stripe.SubscriptionStatusCanceled),
		CurrentPeriodEnd:       row.CurrentPeriodEnd,
		CancelAtPeriodEnd:      row.CancelAtPeriodEnd,
		CancelAt:               row.CancelAt,
	})
	if err != nil {
		return "", fmt.Errorf("mark deleted subscription canceled: %w", err)
	}
	return row.ProviderCustomerID, nil
}

type stripePurchase struct {
	productID string
	priceID   string
	periodEnd pgtype.Timestamptz
}

func stripeSubscriptionPurchase(sub *stripe.Subscription) (stripePurchase, error) {
	var purchase stripePurchase
	if sub.Items == nil {
		return purchase, fmt.Errorf("subscription missing items")
	}
	for _, item := range sub.Items.Data {
		if item == nil || item.Price == nil || item.Price.Product == nil {
			continue
		}
		productID := item.Price.Product.ID
		priceID := item.Price.ID
		if productID == "" || priceID == "" {
			continue
		}
		if purchase.productID != "" && (purchase.productID != productID || purchase.priceID != priceID) {
			return stripePurchase{}, fmt.Errorf("subscription contains multiple products or prices")
		}
		purchase.productID = productID
		purchase.priceID = priceID
		if item.CurrentPeriodEnd > purchase.periodEnd.Time.Unix() {
			purchase.periodEnd = pgtype.Timestamptz{Time: time.Unix(item.CurrentPeriodEnd, 0).UTC(), Valid: true}
		}
	}
	if purchase.productID == "" || purchase.priceID == "" {
		return stripePurchase{}, fmt.Errorf("subscription missing product or price")
	}
	return purchase, nil
}

func stripeSubscriptionCancelAt(sub *stripe.Subscription) pgtype.Timestamptz {
	if sub.CancelAt <= 0 {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: time.Unix(sub.CancelAt, 0).UTC(), Valid: true}
}

func (s *Service) upsertSubscription(ctx context.Context, userID uuid.UUID, sub *stripe.Subscription) error {
	if sub.Customer == nil || sub.Customer.ID == "" {
		return fmt.Errorf("subscription missing customer")
	}
	purchase, err := stripeSubscriptionPurchase(sub)
	if err != nil {
		return err
	}
	product, err := s.validateSubscriptionPurchase(purchase)
	if err != nil {
		return err
	}
	_, err = s.store.UpsertBillingSubscription(ctx, database.UpsertBillingSubscriptionParams{
		UserID:                 userID,
		Provider:               ProviderStripe,
		ProviderCustomerID:     sub.Customer.ID,
		ProviderSubscriptionID: pgtype.Text{String: sub.ID, Valid: true},
		ProviderProductID:      pgtype.Text{String: purchase.productID, Valid: true},
		ProviderPriceID:        pgtype.Text{String: purchase.priceID, Valid: true},
		ProductCode:            string(product),
		Status:                 string(sub.Status),
		CurrentPeriodEnd:       purchase.periodEnd,
		CancelAtPeriodEnd:      sub.CancelAtPeriodEnd,
		CancelAt:               stripeSubscriptionCancelAt(sub),
	})
	if err != nil {
		return fmt.Errorf("upsert billing subscription: %w", err)
	}
	return nil
}
