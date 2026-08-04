// Package riverconst defines queue names and priority levels shared across
// packages. It is intentionally dependency-free to avoid import cycles.
package riverconst

const (
	QueueLogParsing  = "log-parsing"
	QueueDiscordSync = "discord-sync"
	QueueRetention   = "retention"
	QueueRankings    = "rankings"
	QueueResync      = "resync"
)

const (
	PriorityHighest = 1
	PriorityHigh    = 2
	PriorityDefault = 3
	PriorityLow     = 4
)
