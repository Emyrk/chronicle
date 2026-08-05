package chroniclesdk

import "time"

// GearTrendsResponse is the observed-gear-trends aggregate for one
// class/spec cohort: per-slot equip rates from recent ranked parses.
// This is observed equipment, not a recommendation.
type GearTrendsResponse struct {
	Class        string `json:"class"`
	Spec         string `json:"spec"`
	LookbackDays int32  `json:"lookback_days"`
	// CohortSize is the number of unique qualifying players (one
	// observation each: the latest gear snapshot in the window).
	CohortSize    int32 `json:"cohort_size"`
	MinSampleSize int32 `json:"min_sample_size"`
	// InsufficientSample is true when the cohort is below the minimum
	// sample size; Slots is empty in that case.
	InsufficientSample bool             `json:"insufficient_sample"`
	GeneratedAt        time.Time        `json:"generated_at"`
	Slots              []GearTrendsSlot `json:"slots"`
}

// GearTrendsSlot is one equipment slot's observed items and enchants.
// Slot is the PlayerOutfit index (0-18).
type GearTrendsSlot struct {
	Slot     int32               `json:"slot"`
	Items    []GearTrendsItem    `json:"items"`
	Enchants []GearTrendsEnchant `json:"enchants,omitempty"`
}

// GearTrendsItem is one observed item with its equip rate.
type GearTrendsItem struct {
	ItemID      int32   `json:"item_id"`
	ItemName    string  `json:"item_name"`
	ItemQuality int32   `json:"item_quality"`
	ItemIcon    string  `json:"item_icon"`
	ItemLevel   *int32  `json:"item_level,omitempty"`
	WearerCount int32   `json:"wearer_count"`
	Percent     float64 `json:"percent"`
}

// GearTrendsEnchant is one observed permanent enchant with its rate.
type GearTrendsEnchant struct {
	EnchantID   int32   `json:"enchant_id"`
	Name        string  `json:"name"`
	WearerCount int32   `json:"wearer_count"`
	Percent     float64 `json:"percent"`
}
