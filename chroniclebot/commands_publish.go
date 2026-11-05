package chroniclebot

import (
	"log/slog"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// publishResult validates an ephemeral result before it can leave the user's view.
// The Discord gateway supplies both the signed clicker identity and original
// message; never accept answer text from a button custom ID.
func publishResult(i *discordgo.InteractionCreate) (string, bool) {
	if i == nil || i.Interaction == nil || i.Type != discordgo.InteractionMessageComponent || i.GuildID == "" || i.ChannelID == "" || i.Message == nil || i.Message.Flags&discordgo.MessageFlagsEphemeral == 0 {
		return "", false
	}
	data := i.MessageComponentData()
	if data.ComponentType != discordgo.ButtonComponent || !strings.HasPrefix(data.CustomID, publishButtonPrefix) || i.Message.ChannelID != i.ChannelID || i.Message.Author == nil || i.Message.Author.ID != i.AppID {
		return "", false
	}
	owner := strings.TrimPrefix(data.CustomID, publishButtonPrefix)
	clicker := ""
	if i.Member != nil && i.Member.User != nil {
		clicker = i.Member.User.ID
	} else if i.User != nil {
		clicker = i.User.ID
	}
	if owner == "" || clicker != owner || strings.TrimSpace(i.Message.Content) == "" {
		return "", false
	}
	return i.Message.Content, true
}

func (b *Bot) handlePublish(s *discordgo.Session, i *discordgo.InteractionCreate) {
	answer, ok := publishResult(i)
	if !ok {
		_ = RespondEphemeral(s, i, "Only the person who asked can publish a private answer in its original channel.")
		return
	}
	if _, loaded := b.publishing.LoadOrStore(i.Message.ID, true); loaded {
		_ = RespondEphemeral(s, i, "This answer is already being published or has been published.")
		return
	}
	// Acknowledge within Discord's interaction deadline before sending the public message.
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredMessageUpdate}); err != nil {
		b.publishing.Delete(i.Message.ID)
		b.logger.Error("acknowledge Discord publish", slog.String("error", err.Error()))
		return
	}
	if _, err := s.ChannelMessageSendComplex(i.ChannelID, &discordgo.MessageSend{Content: answer, AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}}}); err != nil {
		b.publishing.Delete(i.Message.ID)
		b.logger.Error("publish Discord answer", slog.String("error", err.Error()))
		if _, followupErr := s.FollowupMessageCreate(i.Interaction, true, &discordgo.WebhookParams{Content: "Couldn't publish this answer. Check channel permissions and try again.", Flags: discordgo.MessageFlagsEphemeral}); followupErr != nil {
			b.logger.Error("report Discord publish failure", slog.String("error", followupErr.Error()))
		}
		return
	}
	// Retain the duplicate-click guard while the ephemeral message can be used,
	// without accumulating published message IDs for the life of the process.
	time.AfterFunc(15*time.Minute, func() { b.publishing.Delete(i.Message.ID) })
	// Keep the original answer private, but remove its button after publishing.
	empty := []discordgo.MessageComponent{}
	if _, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Components: &empty}); err != nil {
		b.logger.Error("remove Discord publish button", slog.String("error", err.Error()))
	}
}
