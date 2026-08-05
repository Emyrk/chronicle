package serviceexternalapi

import "net/http"

func (s *Service) registerRoutes() {
	s.register(http.MethodGet, "/health", OpenAPIOperation{
		Summary:     "Check API health",
		Description: "Returns whether Chronicle's external API is available.",
		Responses:   okResponse(HealthResponse{Status: "ok"}),
	}, s.health)

	s.register(http.MethodGet, "/explore/servers", OpenAPIOperation{
		Summary:     "List supported servers",
		Description: "Lists the servers and their realms visible to the current Chronicle community. Results are tenant-aware.",
		Responses: okResponse(ServersResponse{Servers: []Server{{
			Name: "Example Server", Description: "A supported World of Warcraft server.",
			Realms: []Realm{{Name: "Example Realm"}},
		}}}),
	}, s.listServers)

	s.register(http.MethodGet, "/explore/servers/{server}/realms", OpenAPIOperation{
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

	s.register(http.MethodGet, "/openapi.json", OpenAPIOperation{
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

func int32Pointer(value int32) *int32 {
	return &value
}
