package billing

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"sync"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/stripe/stripe-go/v87"
)

const (
	TierFree       = "free"
	TierRevered    = "revered"
	ProviderStripe = "stripe"
)

type accountRetriever func(context.Context, *stripe.AccountRetrieveParams) (*stripe.Account, error)
type priceRetriever func(context.Context, string, *stripe.PriceRetrieveParams) (*stripe.Price, error)
type subscriptionRetriever func(context.Context, string, *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error)
type subscriptionLister func(context.Context) ([]*stripe.Subscription, error)
type activeEntitlementLister func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error)

type Options struct {
	Store         database.Store
	SecretKey     string
	WebhookSecret string
	PriceIDs      []string
	AccessURL     *url.URL
}

type Service struct {
	store                  database.Store
	stripe                 *stripe.Client
	webhookSecret          string
	priceIDs               []string
	allowedPrices          map[string]struct{}
	accessURL              *url.URL
	retrieveAccount        accountRetriever
	retrievePrice          priceRetriever
	retrieveSubscription   subscriptionRetriever
	listSubscriptions      subscriptionLister
	listActiveEntitlements activeEntitlementLister

	pricesMu sync.Mutex
	prices   []chroniclesdk.BillingPrice
}

func New(opts Options) *Service {
	var client *stripe.Client
	var retrieveAccount accountRetriever
	var retrievePrice priceRetriever
	var retrieveSubscription subscriptionRetriever
	var listSubscriptions subscriptionLister
	var listActiveEntitlements activeEntitlementLister
	if opts.SecretKey != "" {
		client = stripe.NewClient(opts.SecretKey)
		retrieveAccount = client.V1Accounts.Retrieve
		retrievePrice = client.V1Prices.Retrieve
		retrieveSubscription = client.V1Subscriptions.Retrieve
		listSubscriptions = func(ctx context.Context) ([]*stripe.Subscription, error) {
			var subscriptions []*stripe.Subscription
			params := &stripe.SubscriptionListParams{Status: stripe.String("all")}
			for sub, err := range client.V1Subscriptions.List(ctx, params).All(ctx) {
				if err != nil {
					return nil, err
				}
				subscriptions = append(subscriptions, sub)
			}
			return subscriptions, nil
		}
		listActiveEntitlements = func(ctx context.Context, customerID string) ([]*stripe.EntitlementsActiveEntitlement, error) {
			var entitlements []*stripe.EntitlementsActiveEntitlement
			params := &stripe.EntitlementsActiveEntitlementListParams{Customer: stripe.String(customerID)}
			for entitlement, err := range client.V1EntitlementsActiveEntitlements.List(ctx, params).All(ctx) {
				if err != nil {
					return nil, err
				}
				entitlements = append(entitlements, entitlement)
			}
			return entitlements, nil
		}
	}
	priceIDs := uniqueStrings(opts.PriceIDs)
	allowedPrices := make(map[string]struct{}, len(priceIDs))
	for _, priceID := range priceIDs {
		allowedPrices[priceID] = struct{}{}
	}
	return &Service{
		store:                  opts.Store,
		stripe:                 client,
		webhookSecret:          opts.WebhookSecret,
		priceIDs:               priceIDs,
		allowedPrices:          allowedPrices,
		accessURL:              opts.AccessURL,
		retrieveAccount:        retrieveAccount,
		retrievePrice:          retrievePrice,
		retrieveSubscription:   retrieveSubscription,
		listSubscriptions:      listSubscriptions,
		listActiveEntitlements: listActiveEntitlements,
	}
}

func (s *Service) SetAccessURL(accessURL *url.URL) {
	if s != nil {
		s.accessURL = accessURL
	}
}

func (s *Service) ValidateAccount(ctx context.Context, expectedAccountID string) error {
	if s == nil || s.retrieveAccount == nil {
		return nil
	}
	if expectedAccountID == "" {
		return fmt.Errorf("stripe account ID is required when a secret key is configured")
	}
	account, err := s.retrieveAccount(ctx, nil)
	if err != nil {
		return fmt.Errorf("retrieve Stripe account: %w", err)
	}
	if account == nil || account.ID == "" {
		return fmt.Errorf("stripe account response is missing an ID")
	}
	if account.ID != expectedAccountID {
		return fmt.Errorf("stripe account mismatch: configured %q, authenticated as %q", expectedAccountID, account.ID)
	}
	return nil
}

func (s *Service) Enabled() bool {
	return s != nil && s.stripe != nil && s.webhookSecret != "" && len(s.priceIDs) > 0 && s.accessURL != nil
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func (s *Service) priceAllowed(priceID string) bool {
	_, ok := s.allowedPrices[priceID]
	return ok
}

func (s *Service) reconciliationEnabled() bool {
	return s != nil && s.listSubscriptions != nil && len(s.allowedPrices) > 0
}

func (s *Service) validateSubscriptionPurchase(product ProductCode, purchase stripePurchase) error {
	if product != ProductSupporter {
		return fmt.Errorf("unknown billing product %q", product)
	}
	if !s.priceAllowed(purchase.priceID) {
		return fmt.Errorf("stripe price %q is not configured for product %q", purchase.priceID, product)
	}
	return nil
}

func (s *Service) supporterPrices(ctx context.Context) ([]chroniclesdk.BillingPrice, error) {
	s.pricesMu.Lock()
	defer s.pricesMu.Unlock()
	if len(s.prices) > 0 {
		return append([]chroniclesdk.BillingPrice(nil), s.prices...), nil
	}

	prices := make([]chroniclesdk.BillingPrice, 0, len(s.priceIDs))
	var productID string
	var currency string
	seenMonths := make(map[int64]struct{}, len(s.priceIDs))
	for _, priceID := range s.priceIDs {
		price, err := s.retrievePrice(ctx, priceID, nil)
		if err != nil {
			return nil, fmt.Errorf("retrieve Stripe price %q: %w", priceID, err)
		}
		billingPrice, err := billingPriceFromStripe(price)
		if err != nil {
			return nil, fmt.Errorf("validate Stripe price %q: %w", priceID, err)
		}
		if productID == "" {
			productID = price.Product.ID
			currency = billingPrice.Currency
		} else if price.Product.ID != productID {
			return nil, fmt.Errorf("configured Stripe prices must belong to the same product")
		} else if billingPrice.Currency != currency {
			return nil, fmt.Errorf("configured Stripe prices must use the same currency")
		}
		if _, ok := seenMonths[billingPrice.IntervalMonths]; ok {
			return nil, fmt.Errorf("configured Stripe prices contain duplicate %d-month periods", billingPrice.IntervalMonths)
		}
		seenMonths[billingPrice.IntervalMonths] = struct{}{}
		prices = append(prices, billingPrice)
	}
	sort.Slice(prices, func(i, j int) bool {
		return prices[i].IntervalMonths < prices[j].IntervalMonths
	})
	s.prices = prices
	return append([]chroniclesdk.BillingPrice(nil), prices...), nil
}

func billingPriceFromStripe(price *stripe.Price) (chroniclesdk.BillingPrice, error) {
	if price == nil || price.ID == "" {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price is missing")
	}
	if !price.Active {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price is inactive")
	}
	if price.Product == nil || price.Product.ID == "" {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price has no product")
	}
	if price.Type != stripe.PriceTypeRecurring || price.Recurring == nil {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price is not recurring")
	}
	if price.BillingScheme != stripe.PriceBillingSchemePerUnit || price.UnitAmount <= 0 {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price must have a positive flat unit amount")
	}
	if price.Recurring.UsageType != stripe.PriceRecurringUsageTypeLicensed {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price must use licensed billing")
	}
	months := price.Recurring.IntervalCount
	switch price.Recurring.Interval {
	case stripe.PriceRecurringIntervalMonth:
	case stripe.PriceRecurringIntervalYear:
		months *= 12
	default:
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price interval must be monthly or yearly")
	}
	if months <= 0 {
		return chroniclesdk.BillingPrice{}, fmt.Errorf("price interval must be positive")
	}
	return chroniclesdk.BillingPrice{
		ID:             price.ID,
		Currency:       string(price.Currency),
		UnitAmount:     price.UnitAmount,
		IntervalMonths: months,
	}, nil
}
