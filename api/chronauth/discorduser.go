package chronauth

import (
	"context"
	"fmt"

  "github.com/Emyrk/chronicle/database"
  "github.com/markbates/goth"
)

func (s *Service) HandleDiscordUser(ctx context.Context, tx database.Store, signup bool, user goth.User) error {
	bot := s.Bot

	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), user.UserID)
	if err != nil {
		return err
	}
	fmt.Println(member)
	return nil
}
