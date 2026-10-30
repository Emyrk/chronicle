package serviceriver

import (
	"fmt"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chroniclebot"
)

// discordFieldLimit is Discord's maximum embed field value length.
const discordFieldLimit = 1024

func accountPurgeNotificationArgs(purge chronicle.AccountPurgeNotification) chroniclebot.ArgsNotifyAdmin {
	title := "Account purged"
	if purge.Status != chronicle.AccountPurgeSucceeded {
		title = "Account purge failed"
	}
	fields := []chroniclebot.AdminNotificationField{
		{Name: "User", Value: valueOrUnknown(purge.Username), Inline: true},
		{Name: "Email", Value: valueOrUnknown(purge.Email), Inline: true},
		{Name: "Logs deleted", Value: fmt.Sprintf("%d", purge.LogsDeleted), Inline: true},
		{Name: "User ID", Value: purge.UserID.String()},
		{Name: "Purge", Value: purge.PurgeID.String()},
	}
	if purge.Error != "" {
		errText := purge.Error
		if len(errText) > discordFieldLimit {
			errText = errText[:discordFieldLimit-3] + "..."
		}
		fields = append(fields, chroniclebot.AdminNotificationField{Name: "Error", Value: errText})
	}
	// The account no longer exists, so there is no admin page to link to.
	return chroniclebot.ArgsNotifyAdmin{Title: title, Fields: fields}
}
