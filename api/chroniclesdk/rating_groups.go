package chroniclesdk

import "github.com/google/uuid"

// RatingRealmGroup identifies a currently configured comparison cohort.
type RatingRealmGroup struct {
	ID             uuid.UUID               `json:"id"`
	ServerID       uuid.UUID               `json:"server_id"`
	Name           string                  `json:"name"`
	Realms         []RatingRealmGroupRealm `json:"realms"`
	EligibleBosses []RatingEligibleBoss    `json:"eligible_bosses"`
}

type RatingRealmGroupRealm struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type RatingEligibleBoss struct {
	InstanceName  string `json:"instance_name"`
	EncounterName string `json:"encounter_name"`
}

type RatingRealmGroupsResponse struct {
	Groups []RatingRealmGroup `json:"groups"`
}
