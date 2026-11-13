package chroniclesdk

import (
	"github.com/google/uuid"
)

type AdminCreateRatingGroupRequest struct {
	ServerID uuid.UUID `json:"server_id"`
	Name     string    `json:"name"`
}

type AdminDeleteRatingBossPolicyRequest struct {
	ExpectedVersion int64  `json:"expected_version"`
	InstanceName    string `json:"instance_name"`
	EncounterName   string `json:"encounter_name"`
}

type AdminDeleteRatingRaidPolicyRequest struct {
	ExpectedVersion int64  `json:"expected_version"`
	InstanceName    string `json:"instance_name"`
}

type AdminPutRatingBossPolicyRequest struct {
	ExpectedVersion int64   `json:"expected_version"`
	InstanceName    string  `json:"instance_name"`
	EncounterName   string  `json:"encounter_name"`
	PeakWeight      float64 `json:"peak_weight"`
	MasteryWeight   float64 `json:"mastery_weight"`
	RenownPoints    float64 `json:"renown_points"`
}

type AdminPutRatingGroupPolicyRequest struct {
	Version       int64   `json:"version"`
	PeriodDays    int64   `json:"period_days"`
	HalfLifeDays  float64 `json:"half_life_days"`
	BestWeight    float64 `json:"best_weight"`
	FormWeight    float64 `json:"form_weight"`
	FloorWeight   float64 `json:"floor_weight"`
	RankOneWeight float64 `json:"rank_one_weight"`
	FullRankKills int64   `json:"full_rank_kills"`
}

type AdminPutRatingRaidPolicyRequest struct {
	ExpectedVersion int64   `json:"expected_version"`
	InstanceName    string  `json:"instance_name"`
	PeakWeight      float64 `json:"peak_weight"`
	MasteryWeight   float64 `json:"mastery_weight"`
}

type AdminRatingBossPoliciesResponse struct {
	Bosses []AdminRatingBossPolicy `json:"bosses"`
}

type AdminRatingBossPolicy struct {
	GroupID       uuid.UUID `json:"group_id"`
	InstanceName  string    `json:"instance_name"`
	EncounterName string    `json:"encounter_name"`
	PeakWeight    float64   `json:"peak_weight"`
	MasteryWeight float64   `json:"mastery_weight"`
	RenownPoints  float64   `json:"renown_points"`
}

type AdminRatingGroup struct {
	ID       uuid.UUID               `json:"id"`
	ServerID uuid.UUID               `json:"server_id"`
	Name     string                  `json:"name"`
	Realms   []RatingRealmGroupRealm `json:"realms"`
}

type AdminRatingGroupPolicy struct {
	GroupID       uuid.UUID `json:"group_id"`
	Version       int64     `json:"version"`
	PeriodDays    int64     `json:"period_days"`
	HalfLifeDays  float64   `json:"half_life_days"`
	BestWeight    float64   `json:"best_weight"`
	FormWeight    float64   `json:"form_weight"`
	FloorWeight   float64   `json:"floor_weight"`
	RankOneWeight float64   `json:"rank_one_weight"`
	FullRankKills int64     `json:"full_rank_kills"`
}

type AdminRatingGroupsResponse struct {
	Groups []AdminRatingGroup `json:"groups"`
}

type AdminRatingPoliciesResponse struct {
	Policies []AdminRatingGroupPolicy `json:"policies"`
}

type AdminRatingRaidPoliciesResponse struct {
	Raids []AdminRatingRaidPolicy `json:"raids"`
}

type AdminRatingRaidPolicy struct {
	GroupID       uuid.UUID `json:"group_id"`
	InstanceName  string    `json:"instance_name"`
	PeakWeight    float64   `json:"peak_weight"`
	MasteryWeight float64   `json:"mastery_weight"`
}

type AdminRenameRatingGroupRequest struct {
	Name string `json:"name"`
}
