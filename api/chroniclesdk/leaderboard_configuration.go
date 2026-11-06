package chroniclesdk

import "github.com/google/uuid"

// LeaderboardConfiguration is a read-only view of shared policy for the request tenant.
// Matching layers are not per-field provenance. Rows are empty on conflict.
type LeaderboardConfiguration struct {
	TenantID          *uuid.UUID                      `json:"tenant_id"`
	TenantName        string                          `json:"tenant_name"`
	DatasetID         uuid.UUID                       `json:"dataset_id"`
	DatasetName       string                          `json:"dataset_name"`
	DatasetFlavor     []string                        `json:"dataset_flavor"`
	AdditionalFlavor  []string                        `json:"additional_flavor"`
	EffectiveFlavor   []string                        `json:"effective_flavor"`
	LeaderboardFlavor []string                        `json:"leaderboard_flavor"`
	Layers            []LeaderboardConfigurationLayer `json:"layers"`
	Rows              []LeaderboardConfigurationRow   `json:"rows"`
	Conflict          string                          `json:"conflict"`
	// Tenants lists the tenants the root site may inspect. Empty on tenant sites.
	Tenants []LeaderboardConfigurationTenant `json:"tenants"`
}

type LeaderboardConfigurationTenant struct {
	ID           uuid.UUID `json:"id"`
	Slug         *string   `json:"slug"`
	Name         string    `json:"name"`
	SquareLogo   string    `json:"square_logo"`
	Discoverable bool      `json:"discoverable"`
}

type LeaderboardConfigurationLayer struct {
	Key             string   `json:"key"`
	RequiredFlavors []string `json:"required_flavors"`
}

type LeaderboardConfigurationRow struct {
	Kind           string  `json:"kind"`
	InstanceName   string  `json:"instance_name"`
	EncounterName  string  `json:"encounter_name"`
	DifficultyName string  `json:"difficulty_name"`
	MaxPlayers     int16   `json:"max_players"`
	SetKey         string  `json:"set_key"`
	SetName        string  `json:"set_name"`
	Position       int32   `json:"position"`
	Points         float64 `json:"points"`
	HasPoints      bool    `json:"has_points"`
}
