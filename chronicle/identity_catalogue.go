package chronicle

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identitycatalog"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
)

// preparedCatalogue is serialized before acquiring the generation publication
// lock. No collector work, dependency lookup or external I/O runs inside the tx.
type preparedCatalogue struct {
	Header  database.InsertLogIdentityCatalogueParams
	Records []database.InsertLogIdentityCatalogueRecordsParams
}

func prepareIdentityCatalogue(header database.InsertLogIdentityCatalogueParams, collector *identitycatalog.Collector) (*preparedCatalogue, error) {
	if collector == nil {
		return nil, fmt.Errorf("missing always-on identity catalogue")
	}
	// Historical jobs omit the selector; execution treats that as legacy.
	if header.ParserEngine == "" {
		header.ParserEngine = string(chroniclesdk.ParserEngineLegacy)
	}
	records := collector.Records()
	header.CatalogueVersion = int32(identitycatalog.StateVersion)
	header.RuleVersion = 1
	header.GuidCount = int64(len(records))
	header.EventCount = collector.EventCount()
	result := &preparedCatalogue{Header: header, Records: make([]database.InsertLogIdentityCatalogueRecordsParams, 0, len(records))}
	for _, record := range records {
		payload, err := json.Marshal(record)
		if err != nil {
			return nil, fmt.Errorf("encode catalogue GUID %s: %w", record.GUID, err)
		}
		result.Records = append(result.Records, database.InsertLogIdentityCatalogueRecordsParams{LogGroupID: header.LogGroupID, Guid: record.GUID, Classification: record.Category, IsUnknown: record.Unknown, HasConflicts: record.Conflict, Payload: payload})
		if !result.Header.FirstSeen.Valid || record.FirstSeen.Before(result.Header.FirstSeen.Time) {
			result.Header.FirstSeen = pgtype.Timestamptz{Time: record.FirstSeen, Valid: true}
		}
		if !result.Header.LastSeen.Valid || record.LastSeen.After(result.Header.LastSeen.Time) {
			result.Header.LastSeen = pgtype.Timestamptz{Time: record.LastSeen, Valid: true}
		}
		if record.GUID.IsZero() {
			result.Header.ZeroGuidCount = record.Observations
		}
	}
	return result, nil
}

func publishIdentityCatalogue(ctx context.Context, tx database.Store, catalogue *preparedCatalogue) error {
	if catalogue == nil {
		return fmt.Errorf("missing prepared identity catalogue")
	}
	if err := tx.DeleteLogIdentityCatalogue(ctx, catalogue.Header.LogGroupID); err != nil {
		return err
	}
	if _, err := tx.InsertLogIdentityCatalogue(ctx, catalogue.Header); err != nil {
		return err
	}
	// Bound each pgx batch independently of the total distinct GUID cardinality.
	const batchSize = 500
	for offset := 0; offset < len(catalogue.Records); offset += batchSize {
		end := min(offset+batchSize, len(catalogue.Records))
		if err := tx.InsertLogIdentityCatalogueRecords(ctx, catalogue.Records[offset:end]).Close(); err != nil {
			return err
		}
	}
	return nil
}
