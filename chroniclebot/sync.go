package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

var ErrMustJoinDiscordServer = errors.New("must be in the discord server to use chronicle")

const protectedTechnicalAdminDiscordID = "221411580535898113"

func ensureProtectedTechnicalAdmin(ctx context.Context, zed authz.Authorizer, discordID string, userID uuid.UUID) error {
	if discordID != protectedTechnicalAdminDiscordID {
		return nil
	}

	b := policy.New()
	b.GlobalChronicle().Technical_admin(b.User(userID))
	if _, err := zed.Write(ctx, *b.Txn()); err != nil {
		return fmt.Errorf("write protected technical_admin: %w", err)
	}
	return nil
}

// SyncDiscordUser manages only the chronicle_guild_member and supporter
// relations for a user based on their Discord guild membership and roles.
// All other roles are left untouched, except that the protected Discord user
// is always granted technical_admin.
func (bot *Bot) SyncDiscordUser(ctx context.Context, zed authz.DatabaseAuthorizer, discordID string, userID uuid.UUID) error {
	if bot.disabled {
		return nil
	}

	if err := ensureProtectedTechnicalAdmin(ctx, zed, discordID, userID); err != nil {
		return err
	}

	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		return fmt.Errorf("get guild member: %w", err)
	}

	// --- chronicle_guild_member ---
	// Targeted delete: remove only chronicle_guild_member for this user.
	f := rel.NewFilter("chronicle", "chronicle", "chronicle_guild_member")
	f.WithSubjectFilter("user", userID.String(), "")
	if err := zed.Delete(ctx, rel.NewPreconditionedFilter(f)); err != nil {
		return fmt.Errorf("delete chronicle_guild_member: %w", err)
	}

	if member != nil {
		// User is in the guild — write chronicle_guild_member.
		b := policy.New()
		b.GlobalChronicle().Chronicle_guild_member(b.User(userID))
		if _, err := zed.Write(ctx, *b.Txn()); err != nil {
			return fmt.Errorf("write chronicle_guild_member: %w", err)
		}
	}

	// --- supporter ---
	// Targeted delete: remove only supporter for this user.
	f2 := rel.NewFilter("chronicle", "chronicle", "supporter")
	f2.WithSubjectFilter("user", userID.String(), "")
	if err := zed.Delete(ctx, rel.NewPreconditionedFilter(f2)); err != nil {
		return fmt.Errorf("delete supporter: %w", err)
	}

	if member != nil {
		for _, roleID := range member.Roles {
			if roleID == "1476428881677389865" || // Booster
				roleID == "1476558127552790812" { // Supporter
				b := policy.New()
				b.GlobalChronicle().Supporter(b.User(userID))
				if _, err := zed.Write(ctx, *b.Txn()); err != nil {
					return fmt.Errorf("write supporter: %w", err)
				}
				if _, err := zed.UpsertDataGrant(ctx, storagegrants.SupportStorageGrant(userID)); err != nil {
					bot.logger.Error("upsert supporter storage grant", slog.String("error", err.Error()))
				}
				break
			}
		}
	}

	return nil
}
