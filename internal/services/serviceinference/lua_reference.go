package serviceinference

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/frontend"
)

// Static, public documentation only. Never include project state or user data.
// Topics are exact, contiguous slices of the agent-first document; no second copy is maintained.
var luaReferenceSkills = mustLuaReferenceSkills(frontend.ModuleAPIReference)

var luaReferenceReadTool = ToolDefinition{Name: "read_skill", Description: "Read a complete Lua Module API topic by skill_id from the reference index. Static documentation only.", Parameters: json.RawMessage(`{"type":"object","properties":{"skill_id":{"type":"string","minLength":1,"maxLength":100}},"required":["skill_id"],"additionalProperties":false}`)}

func mustLuaReferenceSkills(source string) []runtimeSkill {
	skills, err := buildLuaReferenceSkills(source)
	if err != nil {
		panic(err)
	} // Embedded documentation must pass validation before shipping.
	return skills
}

// IDs are explicit document metadata, not slugs of incidental prose headings.
// Each marker starts a complete topic; everything before the first is the core.
var luaTopicMarker = regexp.MustCompile(`^<!-- LUA API TOPIC: ([a-z0-9]+(?:-[a-z0-9]+)*) \| ([^|]+) \| ([^|]+) -->$`)

func buildLuaReferenceSkills(source string) ([]runtimeSkill, error) {
	type topic struct {
		start              int
		id, title, summary string
	}
	var topics []topic
	offset, fenceLength := 0, 0
	var fence byte
	for _, line := range strings.SplitAfter(source, "\n") {
		text := strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
		trimmed := strings.TrimLeft(text, " ")
		// Ignore topic-looking text inside fenced examples. Closing fences must
		// have the same character and at least the opening fence's length.
		if len(text)-len(trimmed) <= 3 && len(trimmed) >= 3 && (trimmed[0] == '`' || trimmed[0] == '~') {
			n := 0
			for n < len(trimmed) && trimmed[n] == trimmed[0] {
				n++
			}
			if fenceLength == 0 && n >= 3 {
				fence, fenceLength = trimmed[0], n
			} else if fenceLength > 0 && trimmed[0] == fence && n >= fenceLength && strings.TrimSpace(trimmed[n:]) == "" {
				fenceLength = 0
			}
		} else if fenceLength == 0 && strings.Contains(text, "<!-- LUA API TOPIC") {
			match := luaTopicMarker.FindStringSubmatch(text)
			if match == nil || strings.TrimSpace(match[2]) == "" || strings.TrimSpace(match[3]) == "" {
				return nil, fmt.Errorf("invalid Lua API topic marker")
			}
			topics = append(topics, topic{offset, luaModuleAPISkillID + "-" + match[1], match[2], match[3]})
		}
		offset += len(line)
	}
	if len(topics) == 0 || strings.TrimSpace(source[:topics[0].start]) == "" {
		return nil, fmt.Errorf("lua API reference requires a core and topics")
	}
	skills := []runtimeSkill{{ID: luaModuleAPISkillID, Name: "Lua Module API", Version: "3"}}
	var overview strings.Builder
	overview.WriteString(source[:topics[0].start])
	overview.WriteString("## Topic index\n\nThe details below are collapsed. Fetch each needed topic before using its APIs. External callers can also discover these IDs with list_skill.\n\n")
	seen := map[string]bool{luaModuleAPISkillID: true}
	for i, topic := range topics {
		if seen[topic.id] || len(topic.id) > 100 {
			return nil, fmt.Errorf("invalid or duplicate Lua reference ID: %s", topic.id)
		}
		seen[topic.id] = true
		end := len(source)
		if i+1 < len(topics) {
			end = topics[i+1].start
		}
		skills = append(skills, runtimeSkill{ID: topic.id, Name: topic.title, Version: "2", Instructions: source[topic.start:end]})
		fmt.Fprintf(&overview, "### %s\n\n%s\n\nFetch: read_skill({\"skill_id\":%q}).\n\n", topic.title, topic.summary, topic.id)
	}
	skills[0].Instructions = overview.String()
	for _, skill := range skills {
		encoded, err := json.Marshal(luaReferenceResponse(skill))
		// Reserve ample space for browser/MCP envelopes and a second JSON encoding
		// under the historical 64 KiB bound. Never truncate documentation.
		if err != nil || len(encoded) > 24<<10 {
			return nil, fmt.Errorf("lua reference topic exceeds budget: %s", skill.ID)
		}
	}
	return skills, nil
}

func luaReferenceResponse(skill runtimeSkill) chroniclesdk.InferenceClientSkillResponse {
	return chroniclesdk.InferenceClientSkillResponse{ID: skill.ID, Name: skill.Name, Version: skill.Version, Instructions: skill.Instructions}
}

func readLuaReference(args string) (string, error) {
	var in struct {
		SkillID string `json:"skill_id"`
	}
	if err := decodeStrict(args, &in); err != nil {
		return "", err
	}
	for _, skill := range luaReferenceSkills {
		if skill.ID == in.SkillID {
			return boundedJSON(luaReferenceResponse(skill))
		}
	}
	return "", fmt.Errorf("unknown Lua reference skill")
}
