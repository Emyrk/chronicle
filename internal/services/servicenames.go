package services

const (
	ServiceLogger     = "logger"
	ServicePrometheus = "prometheus"
	ServicePProf      = "pprof"
	ServiceStorage    = "storage"
	ServicePGXPool    = "pgxpool"
	ServiceDatabase   = "database"
	ServiceRiverQueue = "riverqueue"
	ServiceChronicle  = "chronicle"
	ServiceDiscordBot = "discordbot"
	ServiceAPI        = "api"
	ServiceAuthz      = "authz"
	ServiceWoWDB      = "wow-db"
	ServiceAssets     = "assets"
	ServiceGameData   = "gamedata"
	ServiceMail       = "mail"
	ServiceAccessURL  = "accessurl"
	ServiceRetention  = "retention"
	ServiceTelemetry   = "telemetry"
	ServiceTenant      = "tenant"
	ServiceApplication = "application"
	ServiceRankings    = "rankings"
	ServiceDataset     = "dataset"
	// ServiceFlavorBackfill is a one-shot boot migration service. It is intended
	// to be deleted (package and registration) once all rows carry a flavor.
	ServiceFlavorBackfill = "flavor-backfill"
)
