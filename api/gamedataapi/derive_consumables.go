package gamedataapi

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
)

// deriveConsumables rebuilds the consumable item/buff cross-reference for a
// dataset from world_item_template and dbc_spells. It is safe to call after
// either source is uploaded; whichever upload happens second will populate the
// complete result.
func (h *Handler) deriveConsumables(ctx context.Context, datasetID uuid.UUID) error {
	return h.zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := tx.DeleteConsumablesByDataset(ctx, datasetID); err != nil {
			return fmt.Errorf("clear derived consumables: %w", err)
		}

		if _, err := tx.InsertDerivedConsumables(ctx, datasetID); err != nil {
			return fmt.Errorf("derive consumable items: %w", err)
		}

		if _, err := tx.InsertDerivedConsumableBuffs(ctx, datasetID); err != nil {
			return fmt.Errorf("derive consumable buffs: %w", err)
		}

		return nil
	}, nil)
}
