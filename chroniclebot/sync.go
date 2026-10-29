package chroniclebot

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

var ErrMustJoinDiscordServer = errors.New("must be in the discord server to use chronicle")

const (
	protectedTechnicalAdminDiscordID = "221411580535898113"
	// Discord-owned supporter sources must not be managed as billing tier roles.
	boosterRoleID   = "1476428881677389865"
	supporterRoleID = "1476558127552790812"
)

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

type syncDiscordUserResult struct {
	Warnings []string
}

// SyncDiscordUser manages Discord-owned membership and supporter relations,
// and best-effort Chronicle-owned paid-tier roles in the configured guild.
// The protected Discord user is always granted technical_admin.
func (bot *Bot) SyncDiscordUser(ctx context.Context, zed authz.DatabaseAuthorizer, discordID string, userID uuid.UUID) error {
	_, err := bot.syncDiscordUser(ctx, zed, discordID, userID)
	return err
}

func (bot *Bot) syncDiscordUser(ctx context.Context, zed authz.DatabaseAuthorizer, discordID string, userID uuid.UUID) (syncDiscordUserResult, error) {
	var result syncDiscordUserResult
	if bot.disabled {
		return result, nil
	}

	if err := ensureProtectedTechnicalAdmin(ctx, zed, discordID, userID); err != nil {
		return result, err
	}

	checkedAt := time.Now().UTC()
	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		safeError := sanitizeMembershipError(err)
		if _, dbErr := bot.config.DB.UpsertDiscordMembershipGrantCheckError(ctx, database.UpsertDiscordMembershipGrantCheckErrorParams{
			UserID:    userID,
			CheckedAt: database.Timestamptz(checkedAt),
			LastError: pgtype.Text{String: safeError, Valid: true},
		}); dbErr != nil {
			return result, fmt.Errorf("record guild member fetch error: %w", dbErr)
		}
		warning := "discord membership sync suspended until next login: " + safeError
		result.Warnings = append(result.Warnings, warning)
		bot.logger.Warn("discord membership sync suspended until next login",
			slog.String("user_id", userID.String()),
			slog.String("error", safeError),
		)
		return result, nil
	}

	if member != nil {
		if err := bot.syncEntitlementRoles(ctx, discordID, userID, member.Roles); err != nil {
			result.Warnings = append(result.Warnings, "sync Discord paid-tier roles: "+err.Error())
			bot.logger.Warn("sync Discord paid-tier roles", slog.String("user_id", userID.String()), slog.String("error", err.Error()))
		}
	}

	// --- chronicle_guild_member ---
	// Targeted delete: remove only chronicle_guild_member for this user.
	f := rel.NewFilter("chronicle", "chronicle", "chronicle_guild_member")
	f.WithSubjectFilter("user", userID.String(), "")
	if err := zed.Delete(ctx, rel.NewPreconditionedFilter(f)); err != nil {
		return result, fmt.Errorf("delete chronicle_guild_member: %w", err)
	}

	if member != nil {
		// User is in the guild — write chronicle_guild_member.
		b := policy.New()
		b.GlobalChronicle().Chronicle_guild_member(b.User(userID))
		if _, err := zed.Write(ctx, *b.Txn()); err != nil {
			return result, fmt.Errorf("write chronicle_guild_member: %w", err)
		}
	}

	// --- supporter ---
	// Targeted delete: remove only supporter for this user.
	f2 := rel.NewFilter("chronicle", "chronicle", "supporter")
	f2.WithSubjectFilter("user", userID.String(), "")
	if err := zed.Delete(ctx, rel.NewPreconditionedFilter(f2)); err != nil {
		return result, fmt.Errorf("delete supporter: %w", err)
	}

	if member != nil {
		for _, roleID := range member.Roles {
			if roleID == boosterRoleID || roleID == supporterRoleID {
				b := policy.New()
				b.GlobalChronicle().Supporter(b.User(userID))
				if _, err := zed.Write(ctx, *b.Txn()); err != nil {
					return result, fmt.Errorf("write supporter: %w", err)
				}
				if _, err := zed.UpsertDataGrant(ctx, storagegrants.SupportStorageGrant(userID)); err != nil {
					bot.logger.Error("upsert supporter storage grant", slog.String("error", err.Error()))
				}
				break
			}
		}

		if _, err := zed.UpsertDataGrant(ctx, storagegrants.DiscordMemberStorageGrant(userID, checkedAt)); err != nil {
			return result, fmt.Errorf("upsert discord member storage grant: %w", err)
		}
		if _, err := zed.UpsertDiscordMembershipGrantCheckMember(ctx, database.UpsertDiscordMembershipGrantCheckMemberParams{
			UserID:    userID,
			CheckedAt: database.Timestamptz(checkedAt),
		}); err != nil {
			return result, fmt.Errorf("record discord member check: %w", err)
		}
		return result, nil
	}

	if _, err := zed.UpsertDiscordMembershipGrantCheckNonMember(ctx, database.UpsertDiscordMembershipGrantCheckNonMemberParams{
		UserID:    userID,
		CheckedAt: database.Timestamptz(checkedAt),
	}); err != nil {
		return result, fmt.Errorf("record discord non-member check: %w", err)
	}
	return result, nil
}
