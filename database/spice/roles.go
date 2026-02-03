package spice

import (
	"context"

	"github.com/Emyrk/chronicle/database/spice/policy"
	"github.com/google/uuid"
)

func (sdb *Spice) MakeOwner(ctx context.Context, userID uuid.UUID) error {
	b := policy.New()
	usr := b.User(userID)
	b.GlobalChronicle().Admin(usr)
	b.GlobalChronicle().Technical_admin(usr)

	_, err := sdb.WriteRelationships(ctx, b.Relationships...)
	return err
}
