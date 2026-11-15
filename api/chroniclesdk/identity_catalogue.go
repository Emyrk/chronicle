package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// IdentityCatalogueHeader records the provenance of one successful parse generation.
type IdentityCatalogueHeader struct {
	LogGroupID       uuid.UUID  `json:"log_group_id"`
	Generation       int64      `json:"generation"`
	DatasetID        uuid.UUID  `json:"dataset_id"`
	DatasetRevision  int64      `json:"dataset_revision"`
	Format           string     `json:"format"`
	Flavor           string     `json:"flavor"`
	ParserEngine     string     `json:"parser_engine"`
	ParserBuild      string     `json:"parser_build"`
	CatalogueVersion int32      `json:"catalogue_version"`
	RuleVersion      int32      `json:"rule_version"`
	FirstSeen        *time.Time `json:"first_seen"`
	LastSeen         *time.Time `json:"last_seen"`
	GUIDCount        int64      `json:"guid_count"`
	EventCount       int64      `json:"event_count"`
	ZeroGUIDCount    int64      `json:"zero_guid_count"`
	CreatedAt        time.Time  `json:"created_at"`
}

// IdentityCatalogueResponse is shared by the paged review and complete download.
// Old logs have a null catalogue and an empty records array. Continue pagination
// with next_after and the catalogue's generation; a replacement returns HTTP 409.
type IdentityCatalogueResponse struct {
	Catalogue *IdentityCatalogueHeader  `json:"catalogue"`
	Records   []IdentityCatalogueRecord `json:"records"`
	NextAfter string                    `json:"next_after,omitempty"`
}

// Wire types mirror identitycatalog without importing its registry dependency,
// which itself uses chroniclesdk. Keep these fields synchronized with the collector.
type IdentityCatalogueRecord struct {
	GUID                GUIDString                  `json:"guid"`
	Entry               uint32                      `json:"entry"`
	Kind                string                      `json:"kind"`
	Category            string                      `json:"category"`
	Affiliation         string                      `json:"affiliation"`
	Recognition         string                      `json:"recognition"`
	Unknown             bool                        `json:"unknown"`
	Conflict            bool                        `json:"conflict"`
	FirstSeen           time.Time                   `json:"first_seen"`
	LastSeen            time.Time                   `json:"last_seen"`
	Observations        int64                       `json:"observations"`
	Contexts            []IdentityCatalogueContext  `json:"contexts"`
	Evidence            []IdentityCatalogueEvidence `json:"evidence"`
	EvidenceOverflow    int64                       `json:"evidence_overflow"`
	EvidenceTruncations int64                       `json:"evidence_truncations"`
}
type IdentityCatalogueContext struct {
	Zone         string    `json:"zone"`
	MapID        uint32    `json:"map_id"`
	InstanceID   uint32    `json:"instance_id"`
	Category     string    `json:"category"`
	Affiliation  string    `json:"affiliation"`
	Recognition  string    `json:"recognition"`
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
	Observations int64     `json:"observations"`
}
type IdentityCatalogueEvidence struct {
	Role         string      `json:"role"`
	RelatedGUID  *GUIDString `json:"related_guid,omitempty"`
	SpellID      int32       `json:"spell_id,omitempty"`
	Name         string      `json:"name,omitempty"`
	FirstSeen    time.Time   `json:"first_seen"`
	LastSeen     time.Time   `json:"last_seen"`
	Observations int64       `json:"observations"`
}
