package chroniclesdk

// NotificationChannel is a delivery method for user notifications.
type NotificationChannel string

const (
	NotificationChannelDiscord NotificationChannel = "discord"
)

// NotificationEvent is something a user can be notified about.
type NotificationEvent string

const (
	// NotificationEventSidekickNotifications covers Sidekick upload acceptance,
	// append acceptance, and upload failures that need user action.
	NotificationEventSidekickNotifications NotificationEvent = "sidekick_notifications"
	// NotificationEventUploadProcessed fires when a newly uploaded log finishes
	// its first parse. Reparses and appends do not fire it.
	NotificationEventUploadProcessed NotificationEvent = "upload_processed"
)

// NotificationSetting is whether one event is delivered over one channel.
type NotificationSetting struct {
	Channel NotificationChannel `json:"channel"`
	Event   NotificationEvent   `json:"event"`
	Enabled bool                `json:"enabled"`
}

// NotificationSettings lists the user's notification opt-ins. Events missing
// from Settings are disabled.
type NotificationSettings struct {
	DiscordLinked bool                  `json:"discord_linked"`
	Settings      []NotificationSetting `json:"settings"`
}
