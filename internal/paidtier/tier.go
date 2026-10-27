// Package paidtier resolves the highest persisted Chronicle billing tier.
package paidtier

import "github.com/Emyrk/chronicle/database"

const (
	Free    = "free"
	Honored = "honored"
	Revered = "revered"
	Exalted = "exalted"
)

func Effective(entitlements []database.BillingEntitlement) string {
	tier := Free
	for _, entitlement := range entitlements {
		switch entitlement.EntitlementKey {
		case "chronicle-exalted":
			return Exalted
		case "chronicle-revered":
			tier = Revered
		case "chronicle-honored":
			if tier == Free {
				tier = Honored
			}
		}
	}
	return tier
}
