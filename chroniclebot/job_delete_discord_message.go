package chroniclebot

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/bwmarrin/discordgo"
	"github.com/riverqueue/river"
)

const KindDeleteDiscordMessage = "delete-discord-message"

// ArgsDeleteDiscordMessage deletes exactly one bot message, not channel history.
type ArgsDeleteDiscordMessage struct {
	ChannelID string `json:"channel_id"`
	MessageID string `json:"message_id"`
}

func (ArgsDeleteDiscordMessage) Kind() string { return KindDeleteDiscordMessage }
func (ArgsDeleteDiscordMessage) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueDiscordAnnouncements, MaxAttempts: 10}
}

type WorkerDeleteDiscordMessage struct {
	river.WorkerDefaults[ArgsDeleteDiscordMessage]
	bot *Bot
}

func (b *Bot) NewWorkerDeleteDiscordMessage() river.Worker[ArgsDeleteDiscordMessage] {
	return &WorkerDeleteDiscordMessage{bot: b}
}

func (w *WorkerDeleteDiscordMessage) Work(ctx context.Context, job *river.Job[ArgsDeleteDiscordMessage]) error {
	if w.bot.session == nil {
		return errors.New("discord bot session unavailable")
	}
	return deleteDiscordMessage(ctx, w.bot.session, job.Args.ChannelID, job.Args.MessageID)
}

func deleteDiscordMessage(ctx context.Context, session *discordgo.Session, channelID, messageID string) error {
	err := session.ChannelMessageDelete(channelID, messageID, discordRequestOption(ctx, "message_expiration"))
	var restErr *discordgo.RESTError
	// Manual deletion or a previous successful attempt already satisfied expiration.
	if errors.As(err, &restErr) && restErr.Message != nil && restErr.Message.Code == discordgo.ErrCodeUnknownMessage {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete expired Discord message %s in channel %s: %w", messageID, channelID, err)
	}
	return nil
}
