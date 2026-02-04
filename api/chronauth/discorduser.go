package chronauth

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/spice"
	"github.com/Emyrk/chronicle/database/spice/policy"
	"github.com/google/uuid"
)

func (s *Service) SyncDiscordUser(ctx context.Context, tx *spice.SpiceDBTX, signup bool, discordID string, userID uuid.UUID) error {
	bot := s.Bot

	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		return err
	}

	err = tx.DeleteUserRoles(ctx, userID)
	if err != nil {
		return fmt.Errorf("clear existing roles: %w", err)
	}
	if member == nil {
		// DELETE ALL PERMS
		return nil
	}

	builder := policy.New()
	usr := builder.User(userID)
	for _, roleID := range member.Roles {
		switch roleID {
		case "1468405974506410110": // Alpha tester
			builder.GlobalChronicle().Log_capable(usr)
		case "1467892674743898297": // Owner
			builder.GlobalChronicle().Technical_admin(usr)
		case "1467890007854551120":
			builder.GlobalChronicle().Admin(usr)
		}
	}

	_, err = tx.WriteRelationships(ctx, builder.Relationships...)
	if err != nil {
		return fmt.Errorf("sync to authz: %w", err)
	}

	return nil
}
