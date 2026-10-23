// Package retentionpolicy defines Chronicle's time-based log retention policy.
//
// The package is deliberately independent of database, worker, parser, and API
// types. Callers supply persisted entitlement keys and instance metadata, then
// use the returned calendar period or retention deadline in their own workflow.
package retentionpolicy

import "time"

// Category identifies the broad kind of instance being retained.
type Category string

const (
	CategoryRaid    Category = "raid"
	CategoryDungeon Category = "dungeon"
)

// Tier identifies the retention service level.
type Tier string

const (
	TierStandard Tier = "standard"
	TierHonored  Tier = "honored"
	TierRevered  Tier = "revered"
	TierExalted  Tier = "exalted"

	// TierDefault is the service level used when no recognized entitlement exists.
	TierDefault = TierStandard
)

// Persisted billing entitlement keys that affect retention. Defining all known
// tiers here keeps tier resolution independent of which products are currently
// sold or implemented by the billing service.
const (
	EntitlementChronicleHonored = "chronicle-honored"
	EntitlementChronicleRevered = "chronicle-revered"
	EntitlementChronicleExalted = "chronicle-exalted"
)

// PolicyKey selects a retention period. Built-in keys mirror instance
// categories. Callers may persist custom keys; unknown keys safely fall back to
// the candidate's category through PeriodFor.
type PolicyKey string

const (
	// PolicyKeyDefault delegates policy selection to the instance category.
	PolicyKeyDefault PolicyKey = "default"
	PolicyKeyRaid    PolicyKey = "raid"
	PolicyKeyDungeon PolicyKey = "dungeon"
)

// Period is a calendar duration. It intentionally does not use time.Duration,
// because months and years must be calculated from the instance end time.
type Period struct {
	Years  int
	Months int
}

// AddTo returns the calendar deadline measured from t.
func (p Period) AddTo(t time.Time) time.Time {
	return t.AddDate(p.Years, p.Months, 0)
}

var periods = map[Tier]map[PolicyKey]Period{
	TierStandard: {
		PolicyKeyRaid:    {Years: 1},
		PolicyKeyDungeon: {Months: 3},
	},
	TierHonored: {
		PolicyKeyRaid:    {Years: 1},
		PolicyKeyDungeon: {Months: 6},
	},
	TierRevered: {
		PolicyKeyRaid:    {Years: 1, Months: 6},
		PolicyKeyDungeon: {Months: 9},
	},
	TierExalted: {
		PolicyKeyRaid:    {Years: 3},
		PolicyKeyDungeon: {Years: 3},
	},
}

// ResolveTier returns the highest recognized retention tier represented by the
// persisted billing entitlement keys. Input ordering and unknown keys do not
// affect the result.
func ResolveTier(entitlementKeys []string) Tier {
	tier := TierDefault
	for _, key := range entitlementKeys {
		switch key {
		case EntitlementChronicleExalted:
			return TierExalted
		case EntitlementChronicleRevered:
			if tier != TierExalted {
				tier = TierRevered
			}
		case EntitlementChronicleHonored:
			if tier == TierStandard {
				tier = TierHonored
			}
		}
	}
	return tier
}

// DefaultPolicyKey returns the built-in policy key for category. Unknown and
// empty categories are treated as raids, which is the conservative default.
func DefaultPolicyKey(category Category) PolicyKey {
	if category == CategoryDungeon {
		return PolicyKeyDungeon
	}
	return PolicyKeyRaid
}

// PeriodForKey returns the exact built-in period for a tier and policy key.
// Unknown tiers use the standard tier. Unknown or custom keys return ok=false,
// allowing callers with their own policy registry to handle them first.
func PeriodForKey(tier Tier, key PolicyKey) (period Period, ok bool) {
	tierPeriods, ok := periods[tier]
	if !ok {
		tierPeriods = periods[TierDefault]
	}
	period, ok = tierPeriods[key]
	return period, ok
}

// PeriodFor returns the applicable period. An empty or default key uses the
// category's built-in key. An unknown or custom key falls back to that same
// default, so a stale persisted key cannot accidentally disable retention.
func PeriodFor(tier Tier, category Category, key PolicyKey) Period {
	if key != "" && key != PolicyKeyDefault {
		if period, ok := PeriodForKey(tier, key); ok {
			return period
		}
	}
	period, _ := PeriodForKey(tier, DefaultPolicyKey(category))
	return period
}

// RetainUntil returns the retention deadline calculated from endTime.
func RetainUntil(endTime time.Time, tier Tier, category Category, key PolicyKey) time.Time {
	return PeriodFor(tier, category, key).AddTo(endTime)
}
