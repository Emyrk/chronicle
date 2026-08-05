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
		Description: "Lists the servers visible to the current Chronicle community. Results are tenant-aware.",
		Responses: okResponse(ServersResponse{Servers: []Server{{
			Name: "Turtle WoW", Description: "A supported World of Warcraft server.",
		}}}),
	}, s.listServers)

	s.register(http.MethodGet, "/explore/servers/{server}/realms", OpenAPIOperation{
		Summary:     "List realms for a server",
		Description: "Accepts a server UUID or case-insensitive server name and lists its visible realms.",
		Parameters: []OpenAPIParameter{
			pathParameter("server", "Server UUID or name", "Turtle WoW"),
		},
		Responses: okResponse(RealmsResponse{
			Server: Server{Name: "Turtle WoW"},
			Realms: []Realm{{Name: "Nordanaar"}},
		}),
	}, s.listRealms)

	characterParameters := []OpenAPIParameter{
		pathParameter("server", "Server UUID or name", "Turtle WoW"),
		pathParameter("realm", "Realm UUID or name", "Nordanaar"),
		pathParameter("character", "Character GUID, decimal game ID, or name", "Example"),
	}
	s.register(http.MethodGet, "/characters/{server}/{realm}/{character}", OpenAPIOperation{
		Summary:     "Get a character",
		Description: "Returns the latest known identity, guild, class, race, level, specialization, role, and item-level data for a character.",
		Parameters:  characterParameters,
		Responses: okResponse(Character{
			Name: "Example", Class: "Warrior", Race: "Human", Gender: "Male", Level: 60,
			Spec: "Fury", Role: "dps",
			Server: Server{Name: "Turtle WoW"}, Realm: Realm{Name: "Nordanaar"},
		}),
	}, s.getCharacter)

	s.register(http.MethodGet, "/characters/{server}/{realm}/{character}/logs", OpenAPIOperation{
		Summary:     "List a character's logs",
		Description: "Returns deduplicated logs the character participated in, newest first. Performance fields use already-computed ranking and parse data when available.",
		Parameters: append(characterParameters,
			queryParameter("page", "Page number, starting at 1", false, "integer", 1),
			queryParameter("page_size", "Results per page, from 1 to 20", false, "integer", 20),
		),
		Responses: okResponse(CharacterLogsResponse{
			Character:  Character{Name: "Example", Server: Server{Name: "Turtle WoW"}, Realm: Realm{Name: "Nordanaar"}},
			Logs:       []CharacterLog{{Name: "Molten Core", BossKills: 10}},
			Pagination: Pagination{Page: 1, PageSize: 20},
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
