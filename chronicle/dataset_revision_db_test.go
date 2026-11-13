package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestDatasetRevisionPublicationTransaction(t *testing.T) {
	t.Parallel()
	for _, mode := range []string{"same", "changed", "deleted"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			db, _ := dbtestutil.NewDB(t)
			dataset, err := db.InsertDataset(ctx, database.InsertDatasetParams{Name: t.Name(), Slug: uuid.NewString(), WowVersion: "1.12.1", DefaultFlavor: []string{}})
			require.NoError(t, err)
			fence, err := captureDatasetRevision(ctx, db, dataset.ID)
			require.NoError(t, err)
			switch mode {
			case "changed":
				_, err = db.BumpDatasetRevision(ctx, dataset.ID)
				require.NoError(t, err)
			case "deleted":
				require.NoError(t, db.DeleteDataset(ctx, dataset.ID))
			}
			id := uuid.New()
			err = db.InTx(ctx, func(tx database.Store) error {
				// A sentinel write makes rollback observable even when the caller did work
				// before acquiring its publication fence. Production must fence first.
				_, err := tx.InsertUser(ctx, database.InsertUserParams{ID: id, Username: id.String(), Email: id.String() + "@test.invalid"})
				if err != nil {
					return err
				}
				return fence.lock(ctx, tx)
			}, nil)
			switch mode {
			case "same":
				require.NoError(t, err)
			case "changed":
				require.ErrorIs(t, err, ErrDatasetRevisionChanged)
			default:
				require.ErrorIs(t, err, pgx.ErrNoRows)
			}
			_, readErr := db.GetUserByID(ctx, id)
			if mode == "same" {
				require.NoError(t, readErr)
			} else {
				require.ErrorIs(t, readErr, pgx.ErrNoRows)
			}
		})
	}
}
