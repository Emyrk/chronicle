package chroniclebot

import (
	"context"
	"fmt"
	"strings"

	"github.com/bwmarrin/discordgo"
)

type ArgsNotifyGuildClaimDecision struct {
	ProofID    string `json:"proof_id"`
	DiscordID  string `json:"discord_id"`
	Status     string `json:"status"`
	URL        string `json:"url,omitempty"`
	TenantName string `json:"tenant_name"`
	GuildName  string `json:"guild_name"`
	RealmName  string `json:"realm_name"`
	Response   string `json:"response,omitempty"`
}

func EnqueueGuildClaimDecision(ctx context.Context, queue DiscordDMInserter, bot *Bot, args ArgsNotifyGuildClaimDecision) error {
	message := guildClaimDecisionMessage(args)
	return EnqueueDiscordDM(ctx, queue, bot, ArgsSendDiscordDM{
		DiscordID: args.DiscordID,
		Message: DiscordDirectMessage{
			Content: message.Content,
			Embeds:  message.Embeds,
		},
		UniqueKey: args.ProofID,
	})
}

func guildClaimDecisionMessage(args ArgsNotifyGuildClaimDecision) *discordgo.MessageSend {
	approved := args.Status == "approved"
	title := "Guild page claim rejected"
	description := "Your guild page claim was rejected."
	color := 0xED4245
	if approved {
		title = "Guild page claimed"
		description = "Your guild page claim was approved. You can now edit the page and manage its Chronicle members."
		color = 0x57F287
	}
	fields := []*discordgo.MessageEmbedField{
		{Name: "Guild", Value: discordEmbedFieldValue(fmt.Sprintf("%s (%s)", args.GuildName, args.RealmName))},
	}
	if strings.TrimSpace(args.TenantName) != "" {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "Site", Value: discordEmbedFieldValue(args.TenantName)})
	}
	if strings.TrimSpace(args.Response) != "" {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "Reviewer message", Value: discordEmbedFieldValue(strings.TrimSpace(args.Response))})
	}
	return &discordgo.MessageSend{
		Embeds:          []*discordgo.MessageEmbed{{Title: title, Description: description, URL: args.URL, Fields: fields, Color: color}},
		AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}},
	}
}
