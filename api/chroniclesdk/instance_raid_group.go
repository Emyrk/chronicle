package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type InstanceRaidGroupMember struct {
	GUID  GUIDString `json:"guid"`
	Name  string     `json:"name,omitempty"`
	Class string     `json:"class,omitempty"`
	Spec  string     `json:"spec,omitempty"`
}

type InstanceRaidGroupComposition struct {
	ObservedAt time.Time                   `json:"observed_at"`
	Groups     [][]InstanceRaidGroupMember `json:"groups"`
}

type InstanceRaidGroupKill struct {
	EncounterID   uuid.UUID                    `json:"encounter_id"`
	EncounterName string                       `json:"encounter_name"`
	KilledAt      time.Time                    `json:"killed_at"`
	Composition   InstanceRaidGroupComposition `json:"composition"`
}

type InstanceRaidGroupResponse struct {
	Available  bool                          `json:"available"`
	Final      *InstanceRaidGroupComposition `json:"final,omitempty"`
	CleanKills []InstanceRaidGroupKill       `json:"clean_kills"`
}
