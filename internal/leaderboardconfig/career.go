package leaderboardconfig

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"slices"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// CareerStore is also implemented by a transaction-bound database.Store. Use a
// repeatable-read transaction when a coherent configuration/evidence snapshot is
// required. Resolve once per tenant read/work batch, not once per subject card.
type CareerStore interface {
	Store
	ListLeaderboardCareerVariants(context.Context, []string) ([]database.LeaderboardCareerVariant, error)
	LeaderboardCareerVariantActive(context.Context, database.LeaderboardCareerVariantActiveParams) (bool, error)
}

type CareerKey struct {
	Instance   string
	Difficulty string
	MaxPlayers int16
}

type CareerBoss struct {
	Name      string
	Points    float64
	HasPoints bool
}

type CareerVariant struct {
	CareerKey
	IncludeAverage bool
	IncludeRenown  bool
	Weight         *float64 // nil is unconfigured, never a fallback weight
	Active         bool
	AverageBosses  []string
	RenownBosses   []CareerBoss
}

type CareerIssue struct {
	CareerKey
	Code string
}

const (
	CareerMissingWeight = "missing_weight"
	CareerInvalidWeight = "invalid_weight"
	CareerEmptyAverage  = "empty_average_selection"
)

type CareerPool struct {
	Variants []CareerVariant
	// Any issue blocks ALL career averages, not Renown. Never drop the offending
	// variant from a denominator and present a partial average as complete.
	Issues []CareerIssue
	// Fingerprint includes tenant, effective membership, awards, weights, flags,
	// activation and issues. Persist it with metric choice to detect stale policy.
	Fingerprint string
}

func (p CareerPool) AveragesReady() bool { return len(p.Issues) == 0 }

// CareerFlavors is deliberately separate from the ordinary board resolver.
// On Wrath, only Wrath configuration may contribute to any career total.
func CareerFlavors(dataset, tenant database.WoWFlavor) database.WoWFlavor {
	flavors := dataset.Merge(tenant).LeaderboardFlavors()
	if flavors.Has(database.FlavorWrath) {
		return database.WoWFlavor{database.FlavorWrath}
	}
	return flavors
}

func ResolveCareer(ctx context.Context, db CareerStore, tenantID uuid.UUID, dataset, tenant database.WoWFlavor) (CareerPool, error) {
	if tenantID == uuid.Nil {
		return CareerPool{}, fmt.Errorf("career requires tenant identity")
	}
	flavors := CareerFlavors(dataset, tenant)
	rows, err := Resolve(ctx, db, flavors, nil)
	if err != nil {
		return CareerPool{}, err
	}
	configs, err := db.ListLeaderboardCareerVariants(ctx, flavors.Strings())
	if err != nil {
		return CareerPool{}, fmt.Errorf("list career configuration: %w", err)
	}
	pool := CareerPool{Variants: []CareerVariant{}, Issues: []CareerIssue{}}
	for _, c := range configs {
		key := CareerKey{c.InstanceName, c.DifficultyName, c.MaxPlayers}
		enabled, exact, hasVariants, defaultEnabled := false, false, false, false
		bosses := map[string]CareerBoss{}
		members := map[string]bool{}
		for _, row := range rows {
			if row.InstanceName != key.Instance {
				continue
			}
			switch row.Kind {
			case "instance":
				enabled = true
			case "variant":
				hasVariants = true
				if row.DifficultyName == key.Difficulty && row.MaxPlayers == key.MaxPlayers {
					exact = true
				}
			case "boss":
				bosses[row.EncounterName] = CareerBoss{row.EncounterName, row.Points, row.HasPoints}
			case "set":
				if row.SetKey == "default" {
					defaultEnabled = true
				}
			case "member":
				if row.SetKey == "default" {
					members[row.EncounterName] = true
				}
			}
		}
		if !enabled || (!exact && (hasVariants || key.Difficulty != "" || key.MaxPlayers != 0)) {
			continue
		}
		// Variant awards override base awards, independent of row iteration order.
		for _, row := range rows {
			if row.Kind == "boss_variant" && row.InstanceName == key.Instance && row.DifficultyName == key.Difficulty && row.MaxPlayers == key.MaxPlayers {
				if _, ok := bosses[row.EncounterName]; ok {
					bosses[row.EncounterName] = CareerBoss{row.EncounterName, row.Points, row.HasPoints}
				}
			}
		}
		v := CareerVariant{CareerKey: key, IncludeAverage: c.IncludeAverage, IncludeRenown: c.IncludeRenown, AverageBosses: []string{}, RenownBosses: []CareerBoss{}}
		if c.Weight.Valid {
			w := c.Weight.Float64
			v.Weight = &w
		}
		names := make([]string, 0, len(bosses))
		for name := range bosses {
			names = append(names, name)
		}
		slices.Sort(names)
		for _, name := range names {
			if c.IncludeRenown {
				v.RenownBosses = append(v.RenownBosses, bosses[name])
			}
			// Same default roster used by whole-raid reads. Optional bosses are not
			// promoted into the average just because they award Renown.
			if c.IncludeAverage && defaultEnabled && members[name] {
				v.AverageBosses = append(v.AverageBosses, name)
			}
		}
		v.Active, err = db.LeaderboardCareerVariantActive(ctx, database.LeaderboardCareerVariantActiveParams{TenantID: tenantID, InstanceName: key.Instance, DifficultyName: key.Difficulty, MaxPlayers: key.MaxPlayers, Bosses: names})
		if err != nil {
			return CareerPool{}, fmt.Errorf("career activation %v: %w", key, err)
		}
		if v.Active && v.IncludeAverage {
			if v.Weight == nil {
				pool.Issues = append(pool.Issues, CareerIssue{key, CareerMissingWeight})
			} else if *v.Weight <= 0 || math.IsInf(*v.Weight, 0) || math.IsNaN(*v.Weight) {
				pool.Issues = append(pool.Issues, CareerIssue{key, CareerInvalidWeight})
			}
			if len(v.AverageBosses) == 0 {
				pool.Issues = append(pool.Issues, CareerIssue{key, CareerEmptyAverage})
			}
		}
		pool.Variants = append(pool.Variants, v)
	}
	slices.SortFunc(pool.Variants, func(a, b CareerVariant) int { return compareCareerKey(a.CareerKey, b.CareerKey) })
	slices.SortFunc(pool.Issues, func(a, b CareerIssue) int {
		if n := compareCareerKey(a.CareerKey, b.CareerKey); n != 0 {
			return n
		}
		return cmp.Compare(a.Code, b.Code)
	})
	payload, err := json.Marshal(struct {
		Tenant uuid.UUID
		Pool   CareerPool
	}{tenantID, pool})
	if err != nil {
		return CareerPool{}, fmt.Errorf("career fingerprint: %w", err)
	}
	pool.Fingerprint = fmt.Sprintf("%x", sha256.Sum256(payload))
	return pool, nil
}

func compareCareerKey(a, b CareerKey) int {
	if n := cmp.Compare(a.Instance, b.Instance); n != 0 {
		return n
	}
	if n := cmp.Compare(a.Difficulty, b.Difficulty); n != 0 {
		return n
	}
	return cmp.Compare(a.MaxPlayers, b.MaxPlayers)
}
