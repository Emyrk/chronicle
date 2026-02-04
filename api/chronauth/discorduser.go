package chronauth

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

func (s *Service) SyncDiscordUser(ctx context.Context, tx database.Store, signup bool, discordID string, userID uuid.UUID) error {
	bot := s.Bot

	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		return err
	}
	fmt.Println(member)
	return nil
}
