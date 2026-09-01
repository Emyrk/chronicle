package serviceexternalapi

import (
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
)

func (s *Service) registerRoutes() {
	s.register(http.MethodGet, "/health", OpenAPIOperation{
		Tags:        []string{"General"},
		Summary:     "Check API health",
		Description: "Returns whether Chronicle's external API is available.",
		Responses:   okResponse(HealthResponse{Status: "ok"}),
	}, s.health)

	s.register(http.MethodGet, "/explore/servers", OpenAPIOperation{
		Tags:        []string{"Explore"},
		Summary:     "List supported servers",
		Description: "Lists the servers and their realms visible to the current Chronicle community. Results are tenant-aware.",
		Responses: okResponse(ServersResponse{Servers: []Server{{
			Name: "Example Server", Description: "A supported World of Warcraft server.",
			Realms: []Realm{{Name: "Example Realm"}},
		}}}),
	}, s.listServers)

	s.register(http.MethodGet, "/explore/servers/{server}/realms", OpenAPIOperation{
		Tags:        []string{"Explore"},
		Summary:     "List realms for a server",
		Description: "Accepts a server UUID or case-insensitive server name and lists its visible realms.",
		Parameters: []OpenAPIParameter{
			pathParameter("server", "Server UUID or name", "Example Server"),
		},
		Responses: okResponse(RealmsResponse{
			Server: Server{Name: "Example Server"},
			Realms: []Realm{{Name: "Example Realm"}},
		}),
	}, s.listRealms)

	characterParameters := []OpenAPIParameter{
		pathParameter("server", "Server UUID or name", "Example Server"),
		pathParameter("realm", "Realm UUID or name", "Example Realm"),
		pathParameter("character", "Character GUID, decimal game ID, or name", "Example"),
	}
	s.register(http.MethodGet, "/characters/{server}/{realm}/{character}", OpenAPIOperation{
		Tags:        []string{"Characters"},
		Summary:     "Get a character",
		Description: "Returns the latest known identity, guild, class, race, level, specialization, role, and item-level data for a character.",
		Parameters:  characterParameters,
		Responses: okResponse(Character{
			Name: "Example", Class: "Warrior", Race: "Human", Gender: "Male", Level: 60,
			Spec: "Fury", Role: "dps",
			Server: Server{Name: "Example Server"}, Realm: Realm{Name: "Example Realm"},
		}),
	}, s.getCharacter)

	s.register(http.MethodGet, "/characters/{server}/{realm}/{character}/instances", OpenAPIOperation{
		Tags:        []string{"Characters"},
		Summary:     "List a character's instances",
		Description: "Returns deduplicated raid instances the character participated in, newest first. Performance fields use already-computed ranking and parse data when available.",
		Parameters: append(characterParameters,
			queryParameter("page", "Page number, starting at 1", false, "integer", 1),
			queryParameter("page_size", "Results per page, from 1 to 50", false, "integer", 50),
		),
		Responses: okResponse(CharacterLogsResponse{
			Character: Character{Name: "Example", Server: Server{Name: "Example Server"}, Realm: Realm{Name: "Example Realm"}},
			Logs: []CharacterLog{{
				Name: "Molten Core", Difficulty: "Normal", MaxPlayers: 40, BossKills: 10,
				Performance: []CharacterEncounterPerformance{{EncounterName: "Ragnaros", DPSParse: int32Pointer(92)}},
			}},
			Pagination: Pagination{Page: 1, PageSize: 50},
		}),
	}, s.listCharacterLogs)

	s.register(http.MethodGet, "/raidlogs/recent", OpenAPIOperation{
		Tags:        []string{"Explore"},
		Summary:     "List recent raid activity",
		Description: "Returns recent parsed raid instances, newest first. Results may be filtered by activity or log-group upload time and are limited to 50 per page.",
		Parameters: []OpenAPIParameter{
			queryParameter("after_date", "Only include activity starting at or after this RFC3339 timestamp", false, "string", "2026-08-01T00:00:00Z"),
			queryParameter("upload_after", "Only include log groups uploaded at or after this RFC3339 timestamp", false, "string", "2026-08-31T00:00:00Z"),
			queryParameter("instance_name", "Instance name. Repeat this parameter to include multiple names.", false, "string", "Molten Core"),
			queryParameter("realm_id", "Realm UUID", false, "string", "00000000-0000-0000-0000-000000000000"),
			queryParameter("guild_id", "Guild UUID", false, "string", "00000000-0000-0000-0000-000000000000"),
			queryParameter("has_video", "Filter by YouTube video presence: true or false", false, "boolean", false),
			queryParameter("page", "Page number, starting at 1", false, "integer", 1),
			queryParameter("page_size", "Results per page, from 1 to 50", false, "integer", 25),
		},
		Responses: okResponse(RecentActivityResponse{
			Activities: []RecentActivity{{
				Name: "Molten Core", Slug: "example-instance", Realm: Realm{ID: uuid.MustParse("22222222-2222-2222-2222-222222222222"), ServerID: uuid.MustParse("11111111-1111-1111-1111-111111111111"), Name: "Example Realm"},
				Difficulty: "Normal", MaxPlayers: 40, PlayerCount: 40, BossKills: 10,
			}},
			Pagination: Pagination{Page: 1, PageSize: 25},
		}),
	}, s.listRecentActivity)

	s.register(http.MethodGet, "/raidlogs/instances/{instance_id}", OpenAPIOperation{
		Tags:        []string{"Raid Instance"},
		Summary:     "Get a raid instance",
		Description: "Returns parsed raid-instance metadata, encounters, units, and players for an instance ID. Hostile activity periods omit internal parser reasons and messages to keep the response compact.",
		Parameters: []OpenAPIParameter{
			pathParameter("instance_id", "Instance UUID", "11111111-1111-1111-1111-111111111111"),
		},
		Responses: okResponse(InstanceResponse{
			WoWInstance: chroniclesdk.WoWInstance{Name: "Molten Core", Slug: "example-instance", DifficultyName: "Normal", MaxPlayers: 40},
			RealmName:   "Example Realm",
			Encounters: []InstanceEncounter{{
				WoWEncounter: chroniclesdk.WoWEncounter{Name: "Ragnaros", Boss: true, KillType: chroniclesdk.KillTypeClean},
				Hostiles:     []InstanceHostile{{Boss: true, Periods: []InstanceHostilePeriod{{EndState: chroniclesdk.EndStateSlain}}}},
			}},
		}),
	}, s.getInstanceBySlug)

	s.register(http.MethodGet, "/raidlogs/instances/{instance_id}/ranking-records", OpenAPIOperation{
		Tags:        []string{"Raid Instance"},
		Summary:     "Get raid-instance DPS and HPS metrics",
		Description: "Returns every per-player encounter ranking record stored for an instance ID, including raw damage, healing, absorption, duration, DPS, HPS, and persisted parse scores when available. Zero-value metrics are retained.",
		Parameters: []OpenAPIParameter{
			pathParameter("instance_id", "Instance UUID", "11111111-1111-1111-1111-111111111111"),
		},
		Responses: okResponse([]InstanceRankingRecord{{
			InstanceRankingRecord: chroniclesdk.InstanceRankingRecord{
				ID:            uuid.MustParse("33333333-3333-3333-3333-333333333333"),
				EncounterID:   uuidPointer(uuid.MustParse("44444444-4444-4444-4444-444444444444")),
				EncounterName: "Ragnaros",
				PlayerGUID:    "Player-00000001",
				PlayerName:    "Example",
				PlayerClass:   "Warrior",
				PlayerSpec:    "Fury",
				PlayerRole:    "dps",
				PlayerLevel:   60,
				DamageDone:    123456,
				HealingDone:   789,
				AbsorbedDone:  100,
				DurationSecs:  120.5,
				DPS:           1024.53,
				HPS:           6.55,
				LogHashedSlug: "example-log",
				KilledAt:      time.Date(2026, time.August, 30, 12, 0, 0, 0, time.UTC),
			},
			DPSParse: &InstanceRankingParse{
				MetricValue: 1024.53, PreciseScore: 91.72, DisplayScore: 92,
				Rank: 18, SampleSize: 842, Status: "ok",
			},
			HPSParse: &InstanceRankingParse{
				MetricValue: 6.55, PreciseScore: 24.11, DisplayScore: 24,
				Rank: 638, SampleSize: 842, Status: "low_confidence",
			},
		}}),
	}, s.getInstanceRankingRecordsBySlug)

	s.register(http.MethodGet, "/raidlogs/instances/{instance_id}/events/{type}", OpenAPIOperation{
		Tags:        []string{"Raid Instance"},
		Summary:     "Get a raid-instance event stream",
		Description: "Returns the stored gzip-compressed protobuf event stream for an instance ID and event type.",
		Parameters: []OpenAPIParameter{
			pathParameter("instance_id", "Instance UUID", "11111111-1111-1111-1111-111111111111"),
			pathParameter("type", "Event stream type, such as damage, heal, resource_change, slain, cast, or aura", "damage"),
		},
		Responses: binaryResponse("Gzip-compressed protobuf event stream."),
	}, s.getInstanceEventsBySlug)

	s.register(http.MethodGet, "/leaderboards/speedruns", OpenAPIOperation{
		Tags:        []string{"Explore"},
		Summary:     "Get the speedrun leaderboard",
		Description: "Returns a paginated list of qualified speedruns after duplicate-group and best-per-guild deduplication. The canonical log is the entry used by the leaderboard; other_logs contains matching uploads excluded as duplicates. timing defaults to full and accepts boss_to_boss for first-boss-pull through final-boss-kill timing.",
		Parameters: []OpenAPIParameter{
			queryParameter("instance_name", "Instance name", true, "string", "Molten Core"),
			queryParameter("timing", "Timing mode: full or boss_to_boss", false, "string", "boss_to_boss"),
			queryParameter("difficulty_name", "Difficulty board. An empty value selects logs without recorded difficulty.", false, "string", "Normal"),
			queryParameter("realm_name", "Realm name. Repeat this parameter to include multiple realms.", false, "string", "Example Realm"),
			queryParameter("min_players", "Minimum player count", false, "integer", 20),
			queryParameter("max_players", "Maximum player count", false, "integer", 40),
			queryParameter("guild_id", "Guild UUID. When set, returns all deduplicated runs for that guild.", false, "string", "00000000-0000-0000-0000-000000000000"),
			queryParameter("since_days", "Only include runs completed within this many days. Zero disables the filter.", false, "integer", 30),
			queryParameter("page", "Page number, starting at 1", false, "integer", 1),
			queryParameter("page_size", "Results per page, from 1 to 50", false, "integer", 50),
		},
		Responses: okResponse(SpeedrunLeaderboardResponse{
			Timing:     "boss_to_boss",
			Pagination: Pagination{Page: 1, PageSize: 50},
			Entries: []SpeedrunLeaderboardEntry{{
				InstanceName: "Molten Core", DifficultyName: "Normal",
				GuildID:   uuid.MustParse("11111111-1111-1111-1111-111111111111"),
				GuildName: "Example Guild", RealmName: "Example Realm", PlayerCount: 40,
				Canonical: SpeedrunLeaderboardLog{
					DurationMs: int64Pointer(3_600_000), HasYoutubeVideo: true,
					YoutubeURL: "https://www.youtube.com/watch?v=example",
				},
				IsDuplicate: true,
				OtherLogs:   []SpeedrunLeaderboardLog{{DurationMs: int64Pointer(3_610_000)}},
			}},
		}),
	}, s.listSpeedrunLeaderboard)

	s.register(http.MethodGet, "/openapi.json", OpenAPIOperation{
		Tags:        []string{"General"},
		Summary:     "Get the OpenAPI document",
		Description: "Returns the OpenAPI 3.1 contract used by Chronicle's developer explorer.",
		Responses: map[string]OpenAPIResponse{
			"200": {Description: "The external API contract."},
		},
	}, s.openAPISpec)
}

func okResponse(example any) map[string]OpenAPIResponse {
	return map[string]OpenAPIResponse{
		"200": {
			Description: "Successful response.",
			Content: map[string]OpenAPIMediaType{
				"application/json": {Example: example},
			},
		},
	}
}

func binaryResponse(description string) map[string]OpenAPIResponse {
	return map[string]OpenAPIResponse{
		"200": {
			Description: description,
			Content: map[string]OpenAPIMediaType{
				"application/octet-stream": {Schema: &OpenAPISchema{Type: "string", Format: "binary"}},
			},
		},
	}
}

func pathParameter(name, description string, example any) OpenAPIParameter {
	return OpenAPIParameter{
		Name: name, In: "path", Description: description, Required: true,
		Schema: OpenAPISchema{Type: "string"}, Example: example,
	}
}

func queryParameter(name, description string, required bool, kind string, example any) OpenAPIParameter {
	return OpenAPIParameter{
		Name: name, In: "query", Description: description, Required: required,
		Schema: OpenAPISchema{Type: kind}, Example: example,
	}
}

func uuidPointer(value uuid.UUID) *uuid.UUID {
	return &value
}

func int32Pointer(value int32) *int32 {
	return &value
}

func int64Pointer(value int64) *int64 {
	return &value
}
