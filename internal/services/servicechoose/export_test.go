package servicechoose

import (
	"context"

	"github.com/Emyrk/chronicle/database"
)

// RefreshOrder runs one popularity refresh against db.
func (s *Service) RefreshOrder(ctx context.Context, db database.Store) error {
	s.db = db
	return s.refreshOrder(ctx)
}
