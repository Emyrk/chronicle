package chronicle

import (
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// ValidateParsedResultProvenance checks the parser's reported inputs against
// values independently resolved by the primary. A future remote ingest must
// call this before writing; the payload must never choose the write-time
// flavor or dataset. The current individual InsertParsed* adapters do not
// constitute a remote ingest or a transaction/generation fence.
func ValidateParsedResultProvenance(result parseresult.Result, format database.LogFormat, flavor database.WoWFlavor, datasetID uuid.UUID) error {
	if result.SchemaVersion != 8 || !supportedParsedAddonFormat(result.Format) || result.Format != format {
		return fmt.Errorf("parse result schema or format does not match resolved inputs: schema %d, payload format %q, resolved format %q", result.SchemaVersion, result.Format, format)
	}
	if datasetID == uuid.Nil || result.DatasetID == uuid.Nil || result.DatasetID != datasetID {
		return fmt.Errorf("parse result dataset does not match resolved dataset")
	}
	// A nil slice means the provenance field was absent/null on the wire.
	// A nonnil empty set is distinct and can match an explicitly empty set.
	if result.Flavor == nil || flavor == nil {
		return fmt.Errorf("parse result flavor or resolved flavor is missing")
	}
	payloadTags, err := provenanceFlavorTags(result.Flavor)
	if err != nil {
		return fmt.Errorf("parse result flavor: %w", err)
	}
	resolvedTags, err := provenanceFlavorTags(flavor)
	if err != nil {
		return fmt.Errorf("resolved flavor: %w", err)
	}
	if len(payloadTags) != len(resolvedTags) {
		return fmt.Errorf("parse result flavor does not match resolved flavor")
	}
	for tag := range resolvedTags {
		if _, ok := payloadTags[tag]; !ok {
			return fmt.Errorf("parse result flavor does not match resolved flavor")
		}
	}
	return nil
}

func provenanceFlavorTags(flavor database.WoWFlavor) (map[database.FlavorTag]struct{}, error) {
	tags := make(map[database.FlavorTag]struct{}, len(flavor))
	for _, tag := range flavor {
		if tag == "" {
			return nil, fmt.Errorf("empty flavor tag")
		}
		if _, exists := tags[tag]; exists {
			return nil, fmt.Errorf("duplicate flavor tag %q", tag)
		}
		tags[tag] = struct{}{}
	}
	return tags, nil
}
