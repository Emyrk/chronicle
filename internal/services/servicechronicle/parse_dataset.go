package servicechronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

// resolveParseDataset never uses the service's pooled/fallback resolver. The
// caller's transaction holds realm -> server -> tenant -> dataset locks until
// commit, preventing both content mutation and dependency selection races.
func resolveParseDataset(ctx context.Context, db database.Store, realmID uuid.UUID, lock bool) (chronicle.ResolvedDataset, error) {
	if !lock {
		var resolved chronicle.ResolvedDataset
		err := db.InTx(ctx, func(tx database.Store) error {
			var err error
			resolved, err = resolveParseDataset(ctx, tx, realmID, true)
			return err
		}, nil)
		return resolved, err
	}
	ctx = servicetenant.AdminBypass(ctx)
	serverID, err := db.LockRealmDatasetResolution(ctx, realmID)
	if err != nil {
		return chronicle.ResolvedDataset{}, fmt.Errorf("lock parse realm resolution: %w", err)
	}
	server, err := db.LockServerDatasetResolution(ctx, serverID)
	if err != nil {
		return chronicle.ResolvedDataset{}, fmt.Errorf("lock parse server resolution: %w", err)
	}
	datasetID := servicedataset.DefaultDatasetID
	var additional []string
	if server.TenantID.Valid {
		tenant, err := db.LockTenantDatasetResolution(ctx, server.TenantID.UUID)
		if err != nil {
			return chronicle.ResolvedDataset{}, fmt.Errorf("lock parse tenant resolution: %w", err)
		}
		if tenant.TenantDatasetID.Valid && tenant.TenantDatasetID.UUID != uuid.Nil {
			datasetID = tenant.TenantDatasetID.UUID
		}
		additional = tenant.AdditionalFlavor
	}
	if server.ServerDatasetID.Valid && server.ServerDatasetID.UUID != uuid.Nil {
		datasetID = server.ServerDatasetID.UUID
	}
	dataset, err := db.LockDatasetForResolution(ctx, datasetID)
	if err != nil {
		return chronicle.ResolvedDataset{}, fmt.Errorf("lock parse dataset resolution: %w", err)
	}
	if datasetID == uuid.Nil || dataset.Revision <= 0 {
		return chronicle.ResolvedDataset{}, fmt.Errorf("invalid parse dataset identity")
	}
	return chronicle.ResolvedDataset{DatasetID: datasetID, Revision: dataset.Revision, Flavor: database.FlavorFromStrings(dataset.DefaultFlavor), AdditionalFlavor: database.FlavorFromStrings(additional)}, nil
}
