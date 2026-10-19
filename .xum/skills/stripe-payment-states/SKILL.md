---
name: stripe-payment-states
description: Maintains Chronicle's Stripe subscription, renewal, cancellation, entitlement, and billing UI state model. Use when changing billing subscriptions, Stripe webhooks or reconciliation, Revered access, checkout eligibility, cancellation UX, or payment-state labels.
metadata:
  type: workflow
  binding: mandatory
---

# Stripe payment states

Keep four separate facts separate throughout Chronicle billing:

1. Stripe subscription lifecycle status.
2. Whether the subscription will renew.
3. The date on which cancellation or renewal occurs.
4. Whether Chronicle currently grants Revered access.

Never infer all four facts from one Stripe field.

## Sources of truth

| Concern | Source |
|---|---|
| Subscription lifecycle | Stripe `subscription.status` |
| Scheduled non-renewal | `cancel_at_period_end` or non-null `cancel_at` |
| Explicit cancellation date | Stripe `cancel_at` |
| Current billing period boundary | Stripe subscription item `current_period_end` |
| Current Revered access | Persisted active `chronicle-revered` entitlement |
| Feature permissions | SpiceDB roles expanded from `chronicle-revered` |

Persist Stripe fields without changing their meaning. Do not overwrite `current_period_end` with `cancel_at`, and do not set `cancel_at_period_end` merely because `cancel_at` is present.

Migrations are immutable after deployment. Always add a new numbered migration for billing schema changes; never edit an existing migration.

## Canonical derived states

Derive the user-facing subscription state from the preserved fields:

| Derived state | Condition | User-facing label |
|---|---|---|
| `ended` | `status == canceled` or `status == incomplete_expired` | Ended |
| `canceling` | lifecycle not ended and (`cancel_at_period_end` or `cancel_at != null`) | Canceling |
| `renewing` | `status == active` and no scheduled cancellation | Active |
| `trialing` | `status == trialing` and no scheduled cancellation | Trialing |
| `payment_issue` | `status` is `past_due`, `unpaid`, or `incomplete` | Payment issue |
| `paused` | `status == paused` | Paused |
| `pending` | no recognized settled state | Pending |

Current Revered access is independent. A `canceling` subscriber remains Revered while `chronicle-revered` is active. A canceled or refunded subscription without that entitlement is not Revered even if an old period-end date is in the future.

## Account and checkout flags

These API flags are derived independently from display state and entitlement access:

- `has_billing_account`: Chronicle has a persisted billing row, including historical rows.
- `has_subscription`: show the current-subscription management surface only when a persisted provider subscription ID exists. It is true for non-ended Stripe lifecycle states and for an ended subscription only while a Revered entitlement remains.
- `can_checkout`: the checkout policy allows another purchase. Do not use it as a lifecycle label or access signal.

Checkout eligibility is its own policy predicate. Chronicle currently blocks checkout through the effective access end plus the billing grace period for `active`, `trialing`, and `past_due`; a canceled subscription blocks only while a Revered entitlement remains through that window. `unpaid`, `incomplete`, `incomplete_expired`, and `paused` do not block checkout. Change this matrix only as an explicit billing policy decision.

## Date rules

- `canceling` with `cancel_at`: show **Cancels on** using `cancel_at`.
- `canceling` with only `cancel_at_period_end`: show **Cancels on** using `current_period_end`.
- `renewing` or `trialing`: show **Renews** using `current_period_end`.
- `ended` without Revered access: label a retained period date **Original period end**.
- Revered access copy may say it remains through the cancellation date, but entitlement presence remains authoritative.

## Implementation checklist

When changing payment states, update the complete pipeline:

- [ ] Stripe snapshot parsing in `internal/billing/`.
- [ ] Add a new immutable `billing_subscriptions` migration and update sqlc queries when a Stripe field must persist; assess startup impact before any data rewrite.
- [ ] Webhook and reconciliation upserts.
- [ ] Checkout eligibility as a separate derived predicate; preserve the documented status and grace-period matrix unless billing policy explicitly changes.
- [ ] `api/chroniclesdk.BillingSummary` and generated TypeScript types.
- [ ] `billingSubscriptionState.ts` as the single frontend derivation point.
- [ ] Subscriber settings labels, dates, explanatory copy, and available actions.
- [ ] Backend tests for webhook and reconciliation persistence.
- [ ] Frontend tests for every canonical derived state.

## Required scenarios

At minimum, test these cases:

1. Active, renewing, Revered.
2. Active with `cancel_at_period_end`, still Revered until the period end.
3. Active with explicit `cancel_at`, still Revered until that date.
4. Canceled and refunded, no entitlement, access ended immediately.
5. Canceled while an entitlement remains, access continues but the subscription itself is ended.
6. Past due or unpaid, with UI copy that does not claim normal renewal.

## Gotchas

- Stripe commonly leaves `status=active` while a cancellation is scheduled. Do not display raw `status` as the complete user-facing state.
- The Customer Portal can use an explicit `cancel_at` while `cancel_at_period_end` is false.
- Email addresses do not identify Stripe Customers. Reuse the persisted `provider_customer_id` during Checkout.
- Stripe retains canceled subscription history. Reconciliation must not rediscover cleared accounts from an unfiltered `status=all` scan.
- Customer-level reconciliation failures should be recorded and shown as a failed run while other customers continue.
- The `chronicle-revered` Stripe feature expands to feature-specific SpiceDB roles; it is not itself a SpiceDB relation.

## Validation

Run all of the following after changing the state model:

```sh
go test ./internal/billing ./api/...
go test ./...
golangci-lint run --build-tags azerothcore --new-from-rev=origin/main
pnpm --dir frontend/chronicle exec vitest run src/pages/Settings/billingSubscriptionState.test.ts
pnpm --dir frontend/chronicle build
git diff --check
```

If a migration or SDK type changes, also regenerate before testing:

```sh
make gen/db
go run -C ./scripts/apitypings main.go > frontend/chronicle/src/api/typesGenerated.ts
```
