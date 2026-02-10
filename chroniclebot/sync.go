package chroniclebot

import (
	"context"
	"errors"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

func (bot *Bot) SyncDiscordUser(ctx context.Context, tx database.Store, discordID string, userID uuid.UUID) (retErr error) {
	b := policy.New()
	c := b.GlobalChronicle()
	usr := b.User(userID)

	// Create a filter to remove all their existing roles from the global namespace
	f := rel.NewFilter(c.Object().ObjectType, c.Object().ObjectId, "")
	f.WithSubjectFilter(usr.Object().ObjectType, usr.Object().ObjectId, "")
	z.spice.Delete(rel.NewPreconditionedFilter(f))

	// Add back roles based on their current discord roles
	var txn rel.Txn
	var _ rel.Txn

	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		return err
	}

	roles := make([]string, 0)
	defer func() {
		_, retErr = tx.UpdateUserRoles(ctx, database.UpdateUserRolesParams{
			ID:        userID,
			Roles:     roles,
			UpdatedAt: database.Timestamptz(time.Now()),
		})
	}()

	if member == nil {
		// DELETE ALL PERMS
		return errors.New("must be in the discord server to use chronicle")
	}

	for _, roleID := range member.Roles {
		switch roleID {
		case "1468405974506410110": // Alpha tester
			roles = append(roles, string(database.UserRolesAlphaTester))
		case "1467892674743898297": // Owner
			roles = append(roles, string(database.UserRolesTechnicalAdmin), string(database.UserRolesAlphaTester))
		case "1467890007854551120":
			roles = append(roles, string(database.UserRolesAdmin), string(database.UserRolesAlphaTester))
		}
	}

	roles = slice.Unique(roles)

	return nil
}
