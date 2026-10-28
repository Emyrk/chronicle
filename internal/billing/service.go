package billing

import (
	"context"
	"fmt"
	"net/url"
	"sort"
	"sync"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v87"
)

const (
	TierFree       = "free"
	TierHonored    = "honored"
	TierRevered    = "revered"
	TierExalted    = "exalted"
	ProviderStripe = "stripe"

	stripeMetadataChronicleUserID = "chronicle_user_id"
)

var paidProducts = []ProductCode{ProductHonored, ProductRevered, ProductExalted}

func tierForProduct(product ProductCode) string {
	return string(product)
}

type accountRetriever func(context.Context, *stripe.AccountRetrieveParams) (*stripe.Account, error)
type priceRetriever func(context.Context, string, *stripe.PriceRetrieveParams) (*stripe.Price, error)
type subscriptionRetriever func(context.Context, string, *stripe.SubscriptionRetrieveParams) (*stripe.Subscription, error)
type checkoutSessionRetriever func(context.Context, string, *stripe.CheckoutSessionRetrieveParams) (*stripe.CheckoutSession, error)
type checkoutSessionCreator func(context.Context, *stripe.CheckoutSessionCreateParams) (*stripe.CheckoutSession, error)
type customerUpdater func(context.Context, string, *stripe.CustomerUpdateParams) (*stripe.Customer, error)
type billingPortalSessionCreator func(context.Context, *stripe.BillingPortalSessionCreateParams) (*stripe.BillingPortalSession, error)
type subscriptionLister func(context.Context) ([]*stripe.Subscription, error)
type activeEntitlementLister func(context.Context, string) ([]*stripe.EntitlementsActiveEntitlement, error)

type Options struct {
	Store                     database.Store
	StripeEntitlementRoles    StripeEntitlementRoleSetter
	RunEntitlementTransaction EntitlementTransactionRunner
	Metrics                   *Metrics
	SecretKey                 string
	WebhookSecret             string
	HonoredPriceIDs           []string
	ReveredPriceIDs           []string
	ExaltedPriceIDs           []string
	AccessURL                 *url.URL
}

type Service struct {
	store                      database.Store
	runEntitlementTransaction  EntitlementTransactionRunner
	metrics                    *Metrics
	stripe                     *stripe.Client
	webhookSecret              string
	priceIDs                   map[ProductCode][]string
	configuredPrices           map[string]ProductCode
	priceConfigurationErr      error
	accessURL                  *url.URL
	retrieveAccount            accountRetriever
	retrievePrice              priceRetriever
	retrieveSubscription       subscriptionRetriever
	retrieveCheckoutSession    checkoutSessionRetriever
	createCheckoutSession      checkoutSessionCreator
	updateCustomer             customerUpdater
	createBillingPortalSession billingPortalSessionCreator
	listSubscriptions          subscriptionLister
	listActiveEntitlements     activeEntitlementLister

	subscriptionChangeNotifier func(context.Context, SubscriptionChangeNotification) error
	cosmeticAuditEnqueuer      func(context.Context, uuid.UUID) error
	discordRoleSyncEnqueuer    func(context.Context, uuid.UUID) error

	pricesMu sync.Mutex
	prices   []chroniclesdk.BillingPrice
}

// SetCosmeticAuditEnqueuer configures best-effort per-user cosmetic repair after
// Stripe entitlement roles have been applied. The daily audit repairs missed jobs.
func (s *Service) SetCosmeticAuditEnqueuer(enqueue func(context.Context, uuid.UUID) error) {
	if s != nil {
		s.cosmeticAuditEnqueuer = enqueue
	}
}

// SetDiscordRoleSyncEnqueuer schedules a role repair when a user's effective
// paid tier changes. The job reads the current tier, never a stale snapshot.
func (s *Service) SetDiscordRoleSyncEnqueuer(enqueue func(context.Context, uuid.UUID) error) {
	if s != nil {
		s.discordRoleSyncEnqueuer = enqueue
	}
}

func New(opts Options) *Service {
	var client *stripe.Client
	var retrieveAccount accountRetriever
	var retrievePrice priceRetriever
	var retrieveSubscription subscriptionRetriever
	var retrieveCheckoutSession checkoutSessionRetriever
	var createCheckoutSession checkoutSessionCreator
	var updateCustomer customerUpdater
	var createBillingPortalSession billingPortalSessionCreator
	var listSubscriptions subscriptionLister
	var listActiveEntitlements activeEntitlementLister
	if opts.SecretKey != "" {
		client = stripe.NewClient(opts.SecretKey)
		retrieveAccount = client.V1Accounts.Retrieve
		retrievePrice = client.V1Prices.Retrieve
		retrieveSubscription = client.V1Subscriptions.Retrieve
		retrieveCheckoutSession = client.V1CheckoutSessions.Retrieve
		createCheckoutSession = client.V1CheckoutSessions.Create
		updateCustomer = client.V1Customers.Update
		createBillingPortalSession = client.V1BillingPortalSessions.Create
		listSubscriptions = func(ctx context.Context) ([]*stripe.Subscription, error) {
			var subscriptions []*stripe.Subscription
			params := &stripe.SubscriptionListParams{}
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
	priceIDs := map[ProductCode][]string{
		ProductHonored: uniqueStrings(opts.HonoredPriceIDs),
		ProductRevered: uniqueStrings(opts.ReveredPriceIDs),
		ProductExalted: uniqueStrings(opts.ExaltedPriceIDs),
	}
	configuredPrices := make(map[string]ProductCode)
	var priceConfigurationErr error
	for _, product := range paidProducts {
		for _, priceID := range priceIDs[product] {
			if existing, ok := configuredPrices[priceID]; ok && existing != product {
				priceConfigurationErr = fmt.Errorf("stripe price %q is configured for both %q and %q", priceID, existing, product)
				continue
			}
			configuredPrices[priceID] = product
		}
	}
	runEntitlementTransaction := opts.RunEntitlementTransaction
	if runEntitlementTransaction == nil && opts.Store != nil {
		roleSetter := opts.StripeEntitlementRoles
		if roleSetter == nil {
			roleSetter, _ = opts.Store.(StripeEntitlementRoleSetter)
		}
		runEntitlementTransaction = NewEntitlementTransactionRunner(opts.Store, roleSetter)
	}
	return &Service{
		store:                      opts.Store,
		runEntitlementTransaction:  runEntitlementTransaction,
		metrics:                    opts.Metrics,
		stripe:                     client,
		webhookSecret:              opts.WebhookSecret,
		priceIDs:                   priceIDs,
		configuredPrices:           configuredPrices,
		priceConfigurationErr:      priceConfigurationErr,
		accessURL:                  opts.AccessURL,
		retrieveAccount:            retrieveAccount,
		retrievePrice:              retrievePrice,
		retrieveSubscription:       retrieveSubscription,
		retrieveCheckoutSession:    retrieveCheckoutSession,
		createCheckoutSession:      createCheckoutSession,
		updateCustomer:             updateCustomer,
		createBillingPortalSession: createBillingPortalSession,
		listSubscriptions:          listSubscriptions,
		listActiveEntitlements:     listActiveEntitlements,
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
	return s != nil && s.stripe != nil && s.webhookSecret != "" && len(s.configuredPrices) > 0 && s.priceConfigurationErr == nil && s.accessURL != nil
}

func (s *Service) syncStripeCustomerMetadata(ctx context.Context, customerID string, userID uuid.UUID) error {
	if s.updateCustomer == nil {
		return nil
	}
	if customerID == "" {
		return fmt.Errorf("stripe customer ID is required")
	}
	_, err := s.updateCustomer(ctx, customerID, &stripe.CustomerUpdateParams{Metadata: map[string]string{
		stripeMetadataChronicleUserID: userID.String(),
	}})
	if err != nil {
		return fmt.Errorf("update Stripe customer %q metadata: %w", customerID, err)
	}
	return nil
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

func (s *Service) productForPrice(priceID string) (ProductCode, bool) {
	product, ok := s.configuredPrices[priceID]
	return product, ok
}

func (s *Service) priceAllowed(priceID string) bool {
	_, ok := s.productForPrice(priceID)
	return ok
}

func (s *Service) reconciliationEnabled() bool {
	return s != nil && s.listSubscriptions != nil && len(s.configuredPrices) > 0 && s.priceConfigurationErr == nil
}

func (s *Service) validateSubscriptionPurchase(purchase stripePurchase) (ProductCode, error) {
	if s.priceConfigurationErr != nil {
		return "", s.priceConfigurationErr
	}
	product, ok := s.productForPrice(purchase.priceID)
	if !ok {
		return "", fmt.Errorf("stripe price %q is not configured", purchase.priceID)
	}
	return product, nil
}

func (s *Service) billingPrices(ctx context.Context) ([]chroniclesdk.BillingPrice, error) {
	s.pricesMu.Lock()
	defer s.pricesMu.Unlock()
	if len(s.prices) > 0 {
		return append([]chroniclesdk.BillingPrice(nil), s.prices...), nil
	}
	if s.priceConfigurationErr != nil {
		return nil, s.priceConfigurationErr
	}

	prices := make([]chroniclesdk.BillingPrice, 0, len(s.configuredPrices))
	var catalogCurrency string
	for _, product := range paidProducts {
		var productID string
		var currency string
		seenMonths := make(map[int64]struct{}, len(s.priceIDs[product]))
		for _, priceID := range s.priceIDs[product] {
			price, err := s.retrievePrice(ctx, priceID, nil)
			if err != nil {
				return nil, fmt.Errorf("retrieve Stripe price %q: %w", priceID, err)
			}
			billingPrice, err := billingPriceFromStripe(price)
			if err != nil {
				return nil, fmt.Errorf("validate Stripe price %q: %w", priceID, err)
			}
			billingPrice.Tier = tierForProduct(product)
			if productID == "" {
				productID = price.Product.ID
				currency = billingPrice.Currency
			} else if price.Product.ID != productID {
				return nil, fmt.Errorf("configured Stripe prices for %s must belong to the same product", product)
			} else if billingPrice.Currency != currency {
				return nil, fmt.Errorf("configured Stripe prices for %s must use the same currency", product)
			}
			if _, ok := seenMonths[billingPrice.IntervalMonths]; ok {
				return nil, fmt.Errorf("configured Stripe prices for %s contain duplicate %d-month periods", product, billingPrice.IntervalMonths)
			}
			seenMonths[billingPrice.IntervalMonths] = struct{}{}
			prices = append(prices, billingPrice)
		}
		if productID != "" {
			if catalogCurrency == "" {
				catalogCurrency = currency
			} else if currency != catalogCurrency {
				return nil, fmt.Errorf("configured Stripe tier prices must use the same currency")
			}
		}
	}
	sort.Slice(prices, func(i, j int) bool {
		if prices[i].Tier == prices[j].Tier {
			return prices[i].IntervalMonths < prices[j].IntervalMonths
		}
		return tierRank(prices[i].Tier) < tierRank(prices[j].Tier)
	})
	s.prices = prices
	return append([]chroniclesdk.BillingPrice(nil), prices...), nil
}

func tierRank(tier string) int {
	switch tier {
	case TierHonored:
		return 1
	case TierRevered:
		return 2
	case TierExalted:
		return 3
	default:
		return 0
	}
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
