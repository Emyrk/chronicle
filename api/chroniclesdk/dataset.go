package chroniclesdk

import (
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Dataset represents a game-data payload (DBC files, spell tables, etc.)
// scoped to a specific WoW client version.
type Dataset struct {
	ID                uuid.UUID  `json:"id"`
	Name              string     `json:"name"`
	Slug              string     `json:"slug"`
	WoWVersion        string     `json:"wow_version"`
	BuildVersion      int32      `json:"build_version"`
	Description       string     `json:"description"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// DatasetFromDB converts a database.Dataset to the SDK type.
func DatasetFromDB(d database.Dataset) Dataset {
	out := Dataset{
		ID:           d.ID,
		Name:         d.Name,
		Slug:         d.Slug,
		WoWVersion:   d.WowVersion,
		BuildVersion: d.BuildVersion,
		Description:  d.Description,
		CreatedAt:    d.CreatedAt.Time,
		UpdatedAt:    d.UpdatedAt.Time,
	}
	return out
}

// UpsertDatasetRequest is the request body for creating or updating a dataset.
// Pointer fields are optional — if nil on update, no change occurs (COALESCE
// preserves the existing value).
type UpsertDatasetRequest struct {
	ID                 uuid.NullUUID `json:"id"`
	Name               string        `json:"name"`
	Slug               string        `json:"slug"`
	WoWVersion         string        `json:"wow_version"`
	BuildVersion       *int32        `json:"build_version"`
	Description        *string       `json:"description"`
}

// IsCreate returns true when the request should insert a new dataset.
func (r UpsertDatasetRequest) IsCreate() bool {
	return !r.ID.Valid || r.ID.UUID == uuid.Nil
}

// DatasetTenantSummary is a lightweight tenant reference used by the import
// CLI's confirmation guard to show which tenants a dataset affects.
type DatasetTenantSummary struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

// ToInsertParams converts the request for a new dataset.
func (r UpsertDatasetRequest) ToInsertParams() database.InsertDatasetParams {
	buildVersion := int32(5875)
	if r.BuildVersion != nil {
		buildVersion = *r.BuildVersion
	}

	description := ""
	if r.Description != nil {
		description = *r.Description
	}

	return database.InsertDatasetParams{
		Name:         r.Name,
		Slug:         r.Slug,
		WowVersion:   r.WoWVersion,
		BuildVersion: buildVersion,
		Description:  description,
	}
}

// ToUpdateParams converts the request for an existing dataset.
// Nil fields produce NULL → COALESCE keeps the existing value.
func (r UpsertDatasetRequest) ToUpdateParams() database.UpdateDatasetParams {
	var name pgtype.Text
	if r.Name != "" {
		name = pgtype.Text{String: r.Name, Valid: true}
	}

	var slug pgtype.Text
	if r.Slug != "" {
		slug = pgtype.Text{String: r.Slug, Valid: true}
	}

	var wowVersion pgtype.Text
	if r.WoWVersion != "" {
		wowVersion = pgtype.Text{String: r.WoWVersion, Valid: true}
	}

	var buildVersion pgtype.Int4
	if r.BuildVersion != nil {
		buildVersion = pgtype.Int4{Int32: *r.BuildVersion, Valid: true}
	}

	var description pgtype.Text
	if r.Description != nil {
		description = pgtype.Text{String: *r.Description, Valid: true}
	}

	return database.UpdateDatasetParams{
		ID:           r.ID.UUID,
		Name:         name,
		Slug:         slug,
		WowVersion:   wowVersion,
		BuildVersion: buildVersion,
		Description:  description,
	}
}
