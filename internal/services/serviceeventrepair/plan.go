package serviceeventrepair

import (
	"crypto/sha256"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// RepairPlan is diagnostic evidence, not an executable mutation payload.
// Only Evaluate creates an executable in-memory plan. JSON is diagnostic only.
type RepairPlan struct {
	Warnings            []string          `json:"warnings,omitempty"`
	Details             map[string]any    `json:"details,omitempty"`
	TenantID            uuid.UUID         `json:"tenant_id"`
	InstanceID          uuid.UUID         `json:"instance_id"`
	RequiresReparse     bool              `json:"requires_reparse"`
	Reason              string            `json:"reason"`
	Changes             []string          `json:"changes"`
	EvidenceHash        string            `json:"evidence_hash"`
	EncounterID         uuid.UUID         `json:"encounter_id,omitempty"`
	Outcome             database.KillType `json:"outcome,omitempty"`
	hostile             *database.LogInstanceEncounterHostile
	phase               *database.LogInstanceEncounterPhase
	numeric             *razorgoreNumericPlan
	multi               *razorgoreMultiPlan
	reconstructedPhases []database.InsertEncounterPhaseParams
	operation           string
	lucifron            *lucifronPlan
	seal                [sha256.Size]byte
}

// RazorgoreRepairPlan retains the original evaluator contract. Both jobs share
// diagnostics and sealing, but carry separate private executable payloads.
type RazorgoreRepairPlan = RepairPlan
