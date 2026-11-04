package ratingmath

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

type evolvingTenantRatingManifest struct {
	Writer       string             `json:"writer"`
	RulesVersion int32              `json:"rules_version"`
	Policy       TenantRatingPolicy `json:"tenant_policy"`
	Bosses       []struct {
		Realm     uuid.UUID `json:"realm_id"`
		Instance  string    `json:"instance_name"`
		Encounter string    `json:"encounter_name"`
		Points    float64   `json:"renown_points"`
	} `json:"renown_bosses"`
}

// Lock the tenant's config revision before resolving its current policy. A
// first-time tenant has no generation or existing revision row to depend on.
func currentEvolvingTenantRatingPolicy(ctx context.Context, tx database.Store, tenant uuid.UUID) (evolvingTenantRatingManifest, error) {
	var manifest evolvingTenantRatingManifest
	if _, err := tx.LockEvolvingTenantRatingRevision(ctx, tenant); err != nil {
		return manifest, err
	}
	policy, err := tx.CurrentTenantRatingPolicy(ctx, tenant)
	if err != nil {
		return manifest, err
	}
	if err := json.Unmarshal(policy, &manifest); err != nil {
		return manifest, fmt.Errorf("invalid current tenant rating policy: %w", err)
	}
	if manifest.Writer != "tenant" || manifest.RulesVersion != 2 ||
		manifest.Policy.TenantID != tenant || manifest.Policy.PeriodDays != 180 {
		return manifest, fmt.Errorf("invalid current tenant rating rules for %s", tenant)
	}
	return manifest, nil
}
