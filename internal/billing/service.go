package billing

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v87"
)

const (
	TierFree      = "free"
	TierSupporter = "supporter"
)

type Options struct {
	Store         database.Store
	SecretKey     string
	WebhookSecret string
	PriceID       string
	AccessURL     *url.URL
}

type Service struct {
	store         database.Store
	stripe        *stripe.Client
	webhookSecret string
	priceID       string
	accessURL     *url.URL
}

func New(opts Options) *Service {
	var client *stripe.Client
	if opts.SecretKey != "" {
		client = stripe.NewClient(opts.SecretKey)
	}
	return &Service{
		store:         opts.Store,
		stripe:        client,
		webhookSecret: opts.WebhookSecret,
		priceID:       opts.PriceID,
		accessURL:     opts.AccessURL,
	}
}

func (s *Service) Enabled() bool {
	return s != nil && s.stripe != nil && s.webhookSecret != "" && s.priceID != "" && s.accessURL != nil
}

func RoleIsAdFree(roles []string) bool {
	for _, role := range roles {
		if role == TierSupporter {
			return true
		}
	}
	return false
}

func (s *Service) IsAdFree(ctx context.Context, userID uuid.UUID, roles []string) (bool, error) {
	if RoleIsAdFree(roles) {
		return true, nil
	}

	granted, err := s.store.HasActiveBillingGrant(ctx, database.HasActiveBillingGrantParams{
		UserID: userID,
		Tier:   TierSupporter,
	})
	if err != nil {
		return false, fmt.Errorf("check billing grant: %w", err)
	}
	if granted {
		return true, nil
	}

	sub, err := s.store.GetBillingSubscriptionByUserID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("get billing subscription: %w", err)
	}
	return subscriptionIsAdFree(time.Now(), sub), nil
}

func subscriptionIsAdFree(now time.Time, sub database.BillingSubscription) bool {
	if sub.Tier != TierSupporter {
		return false
	}
	switch sub.Status {
	case string(stripe.SubscriptionStatusActive), string(stripe.SubscriptionStatusTrialing):
		return true
	case string(stripe.SubscriptionStatusCanceled):
		return sub.CurrentPeriodEnd.Valid && sub.CurrentPeriodEnd.Time.After(now)
	default:
		return false
	}
}

func giftWindow(now time.Time, latest pgtype.Timestamptz, months int32) (time.Time, time.Time) {
	start := now.UTC()
	if latest.Valid && latest.Time.After(start) {
		start = latest.Time
	}
	return start, start.AddDate(0, int(months), 0)
}

func (s *Service) GrantMonths(ctx context.Context, userID, grantedBy uuid.UUID, months int32, reason string) (database.BillingGrant, error) {
	if months < 1 || months > 120 {
		return database.BillingGrant{}, fmt.Errorf("months must be between 1 and 120")
	}
	if reason == "" {
		return database.BillingGrant{}, fmt.Errorf("reason is required")
	}

	latest, err := s.store.GetLatestActiveBillingGrantExpiry(ctx, userID)
	if err != nil {
		return database.BillingGrant{}, fmt.Errorf("get latest billing grant: %w", err)
	}
	start, expires := giftWindow(time.Now(), latest, months)

	grant, err := s.store.InsertBillingGrant(ctx, database.InsertBillingGrantParams{
		ID:        uuid.New(),
		UserID:    userID,
		Tier:      TierSupporter,
		StartsAt:  pgtype.Timestamptz{Time: start, Valid: true},
		ExpiresAt: pgtype.Timestamptz{Time: expires, Valid: true},
		Months:    months,
		Reason:    reason,
		GrantedBy: grantedBy,
	})
	if err != nil {
		return database.BillingGrant{}, fmt.Errorf("insert billing grant: %w", err)
	}
	return grant, nil
}
