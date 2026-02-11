package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

func (bot *Bot) SyncDiscordUser(ctx context.Context, zed authz.DatabaseAuthorizer, discordID string, userID uuid.UUID) (retErr error) {
	b := policy.New()
	gChron := b.GlobalChronicle()
	usr := b.User(userID)

	// Create a filter to remove all their existing roles from the global namespace
	f := rel.NewFilter(gChron.Object().Typ, gChron.Object().ID, "")
	f.WithSubjectFilter(usr.Object().Typ, usr.Object().ID, "")
	err := zed.Delete(ctx, rel.NewPreconditionedFilter(f))
	if err != nil {
		return fmt.Errorf("zed.Delete: %w", err)
	}

	// Add back roles based on their current discord roles

	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		return err
	}

	roles := make([]string, 0)
	defer func() {
		// TODO: DELETE THIS
		_, retErr = zed.UpdateUserRoles(ctx, database.UpdateUserRolesParams{
			ID:        userID,
			Roles:     roles,
			UpdatedAt: database.Timestamptz(time.Now()),
		})
	}()

	if member == nil {
		// DELETE ALL PERMS
		return errors.New("must be in the discord server to use chronicle")
	}

	var txn rel.Txn
	for _, roleID := range member.Roles {
		switch roleID {
		case "1468405974506410110": // Alpha tester
			roles = append(roles, string(database.UserRolesAlphaTester))
			gChron.Upload_capable(usr)
		case "1467892674743898297": // Owner
			roles = append(roles, string(database.UserRolesTechnicalAdmin), string(database.UserRolesAlphaTester))
			gChron.Technical_admin(usr)
		case "1467890007854551120": // Admin
			roles = append(roles, string(database.UserRolesAdmin), string(database.UserRolesAlphaTester))
			gChron.Admin(usr)
		}
	}

	roles = slice.Unique(roles)
	_, err = zed.Write(ctx, txn)
	if err != nil {
		return fmt.Errorf("zed.Write: %w", err)
	}

	return nil
}
