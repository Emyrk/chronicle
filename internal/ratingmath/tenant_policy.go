package ratingmath

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// TenantRatingPolicy is the immutable, versioned product rule frozen into each
// tenant rebuild. It is not a database configuration or an admin setting.
type TenantRatingPolicy struct {
	TenantID      uuid.UUID `json:"tenant_id"`
	Version       int32     `json:"version"`
	PeriodDays    int32     `json:"period_days"`
	BestWeight    float64   `json:"best_weight"`
	FormWeight    float64   `json:"form_weight"`
	FloorWeight   float64   `json:"floor_weight"`
	RankOneWeight float64   `json:"rank_one_weight"`
	FullRankKills int32     `json:"full_rank_kills"`
}

func (p TenantRatingPolicy) masteryPolicy() database.RatingGroupPolicy {
	return database.RatingGroupPolicy{
		PeriodDays: p.PeriodDays,
		BestWeight: p.BestWeight, FormWeight: p.FormWeight, FloorWeight: p.FloorWeight,
		RankOneWeight: p.RankOneWeight, FullRankKills: p.FullRankKills,
	}
}
