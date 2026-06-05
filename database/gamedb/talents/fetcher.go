package talents

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrNoTalentData indicates a dataset has no talent tree data imported yet.
// Callers should treat this as a 404, not a server error.
var ErrNoTalentData = errors.New("no talent data for dataset")

// TalentFetcher loads and caches pre-computed talent tree data per dataset.
type TalentFetcher interface {
	// TalentTrees returns the talent tree data for a dataset.
	// Results are cached per dataset_id.
	TalentTrees(ctx context.Context, datasetID uuid.UUID) (*TalentTreeData, error)
}

// TalentQuerier is the narrow DB interface for talent tree data.
// database.Store satisfies this implicitly.
type TalentQuerier interface {
	GetDatasetTalentTrees(ctx context.Context, datasetID uuid.UUID) ([]byte, error)
}

type fetcher struct {
	db    TalentQuerier
	cache *lrucache.Cache[uuid.UUID, *TalentTreeData]
}

// NewFetcher creates a TalentFetcher backed by the given DB and an LRU cache.
func NewFetcher(db TalentQuerier, cacheSize int, metrics *lrucache.Metrics) TalentFetcher {
	cache, _ := lrucache.New(lrucache.Opts[uuid.UUID, *TalentTreeData]{
		Name:      "talents",
		Capacity:  cacheSize,
		Metrics:   metrics,
		DatasetOf: func(k uuid.UUID) string { return k.String() },
	})
	return &fetcher{db: db, cache: cache}
}

func (f *fetcher) TalentTrees(ctx context.Context, datasetID uuid.UUID) (*TalentTreeData, error) {
	if cached, ok := f.cache.Get(datasetID); ok {
		return cached, nil
	}

	raw, err := f.db.GetDatasetTalentTrees(ctx, datasetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", ErrNoTalentData, datasetID)
		}
		return nil, fmt.Errorf("get talent trees for dataset %s: %w", datasetID, err)
	}

	var data TalentTreeData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("unmarshal talent trees for dataset %s: %w", datasetID, err)
	}

	f.cache.Add(datasetID, &data)
	return &data, nil
}
