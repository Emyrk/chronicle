package chroniclesdk

import "github.com/google/uuid"

// Admin rating configuration is tenant-scoped to the request host. The root
// domain uses the nil UUID. Clients cannot select another tenant in a payload.
type AdminCreateRatingGroupRequest struct {
	ServerID uuid.UUID `json:"server_id"`
	Name     string    `json:"name"`
}
type AdminRenameRatingGroupRequest struct {
	Name string `json:"name"`
}
type AdminRatingGroup struct {
	ID       uuid.UUID               `json:"id"`
	ServerID uuid.UUID               `json:"server_id"`
	Name     string                  `json:"name"`
	Realms   []RatingRealmGroupRealm `json:"realms"`
}
type AdminRatingGroupsResponse struct {
	Groups []AdminRatingGroup `json:"groups"`
}
type AdminRatingPoliciesResponse struct {
	Policies []AdminRatingGroupPolicy `json:"policies"`
}
type AdminRatingGroupPolicy struct {
	GroupID       uuid.UUID `json:"group_id"`
	Version       int32     `json:"version"`
	PeriodDays    int32     `json:"period_days"`
	HalfLifeDays  float64   `json:"half_life_days"`
	BestWeight    float64   `json:"best_weight"`
	FormWeight    float64   `json:"form_weight"`
	FloorWeight   float64   `json:"floor_weight"`
	RankOneWeight float64   `json:"rank_one_weight"`
	FullRankKills int32     `json:"full_rank_kills"`
}

// AdminRatingJobResponse reports an accepted River job. When unique_skipped_as_duplicate
// is true, job_id identifies the existing queued or running job, not a new job.
type AdminRatingJobResponse struct {
	JobID                    int64  `json:"job_id"`
	JobState                 string `json:"job_state"`
	UniqueSkippedAsDuplicate bool   `json:"unique_skipped_as_duplicate"`
}

// A policy write must use a version strictly greater than the stored version.
type AdminPutRatingGroupPolicyRequest struct {
	Version       int32   `json:"version"`
	PeriodDays    int32   `json:"period_days"`
	HalfLifeDays  float64 `json:"half_life_days"`
	BestWeight    float64 `json:"best_weight"`
	FormWeight    float64 `json:"form_weight"`
	FloorWeight   float64 `json:"floor_weight"`
	RankOneWeight float64 `json:"rank_one_weight"`
	FullRankKills int32   `json:"full_rank_kills"`
}

// Raid policies explicitly configure instance-level rating weights.
type AdminRatingRaidPolicy struct {
	GroupID       uuid.UUID `json:"group_id"`
	InstanceName  string    `json:"instance_name"`
	PeakWeight    float64   `json:"peak_weight"`
	MasteryWeight float64   `json:"mastery_weight"`
}
type AdminRatingRaidPoliciesResponse struct {
	Raids []AdminRatingRaidPolicy `json:"raids"`
}
type AdminPutRatingRaidPolicyRequest struct {
	ExpectedVersion int32   `json:"expected_version"`
	InstanceName    string  `json:"instance_name"`
	PeakWeight      float64 `json:"peak_weight"`
	MasteryWeight   float64 `json:"mastery_weight"`
}
type AdminDeleteRatingRaidPolicyRequest struct {
	ExpectedVersion int32  `json:"expected_version"`
	InstanceName    string `json:"instance_name"`
}

type AdminRatingBossPolicy struct {
	GroupID       uuid.UUID `json:"group_id"`
	InstanceName  string    `json:"instance_name"`
	EncounterName string    `json:"encounter_name"`
	PeakWeight    float64   `json:"peak_weight"`
	MasteryWeight float64   `json:"mastery_weight"`
	RenownPoints  float64   `json:"renown_points"`
}
type AdminRatingBossPoliciesResponse struct {
	Bosses []AdminRatingBossPolicy `json:"bosses"`
}
type AdminPutRatingBossPolicyRequest struct {
	ExpectedVersion int32   `json:"expected_version"`
	InstanceName    string  `json:"instance_name"`
	EncounterName   string  `json:"encounter_name"`
	PeakWeight      float64 `json:"peak_weight"`
	MasteryWeight   float64 `json:"mastery_weight"`
	RenownPoints    float64 `json:"renown_points"`
}
type AdminDeleteRatingBossPolicyRequest struct {
	ExpectedVersion int32  `json:"expected_version"`
	InstanceName    string `json:"instance_name"`
	EncounterName   string `json:"encounter_name"`
}
