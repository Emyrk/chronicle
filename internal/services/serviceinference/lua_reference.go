package serviceinference

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/frontend"
)

// Static, public documentation only. Never include project state or user data.
// Sections are exact, contiguous slices of the human document; no second copy is maintained.
var luaReferenceSkills = mustLuaReferenceSkills(frontend.ModuleAPIReference)

var luaReferenceReadTool = ToolDefinition{Name: "read_skill", Description: "Read a Lua Module API section by skill_id from the reference index. Static documentation only.", Parameters: json.RawMessage(`{"type":"object","properties":{"skill_id":{"type":"string","minLength":1,"maxLength":100}},"required":["skill_id"],"additionalProperties":false}`)}

func mustLuaReferenceSkills(source string) []runtimeSkill {
	skills, err := buildLuaReferenceSkills(source)
	if err != nil {
		panic(err)
	} // Embedded documentation must pass validation before shipping.
	return skills
}

func luaReferenceSlug(s string) string {
	return strings.Trim(strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return unicode.ToLower(r)
		}
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			return r
		}
		if r == '`' {
			return -1
		}
		return '-'
	}, s), "-")
}

func buildLuaReferenceSkills(source string) ([]runtimeSkill, error) {
	type heading struct {
		start           int
		title, id, line string
		essential       bool
	}
	headings := []heading{{title: "Introduction", id: luaModuleAPISkillID + "-introduction", essential: true}}
	parent := ""
	offset, fenceLength := 0, 0
	var fence byte
	for _, line := range strings.SplitAfter(source, "\n") {
		text := strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
		trimmed := strings.TrimLeft(text, " ")
		// Markdown fences may be indented up to three spaces. A shorter fence,
		// or one with a different character, cannot close the current block.
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
		} else if fenceLength == 0 && (strings.HasPrefix(text, "## ") || strings.HasPrefix(text, "### ")) {
			level := strings.IndexByte(text, ' ')
			title := strings.TrimSpace(text[level+1:])
			slug := luaReferenceSlug(title)
			if level == 2 {
				parent = slug
			} else {
				slug = parent + "-" + slug
			}
			essential := level == 2 && (title == "Quick start" || title == "How a module runs" || title == "Standard library" || title == "Limits" || title == "Performance")
			headings = append(headings, heading{offset, title, luaModuleAPISkillID + "-" + slug, text, essential})
		}
		offset += len(line)
	}
	skills := []runtimeSkill{{ID: luaModuleAPISkillID, Name: "Lua Module API", Version: "2"}}
	var overview strings.Builder
	overview.WriteString("# Lua Module API agent reference\n\nThis is a collapsed view of /modules/api. Before using an API, fetch its relevant sections verbatim with read_skill using the skill_id shown below, for example read_skill({\"skill_id\":\"lua-module-api-events\"}). Do not guess omitted signatures. Every section is listed below; external callers can also discover them with list_skill.\n\n")
	seen := map[string]bool{luaModuleAPISkillID: true}
	for i, h := range headings {
		if seen[h.id] || len(h.id) > 100 {
			return nil, fmt.Errorf("invalid or duplicate Lua reference ID: %s", h.id)
		}
		seen[h.id] = true
		end := len(source)
		if i+1 < len(headings) {
			end = headings[i+1].start
		}
		body := source[h.start:end]
		skills = append(skills, runtimeSkill{ID: h.id, Name: h.title, Version: "1", Instructions: body})
		if h.essential {
			overview.WriteString(body)
		} else {
			fmt.Fprintf(&overview, "%s\n\n[Collapsed. Fetch with read_skill({\"skill_id\":%q}).]\n\n", h.line, h.id)
		}
	}
	skills[0].Instructions = overview.String()
	for _, skill := range skills {
		encoded, err := json.Marshal(luaReferenceResponse(skill))
		// Leave ample room for JSON escaping and the browser/MCP continuation envelopes,
		// including a second JSON encoding, under the historical 64 KiB bound.
		if err != nil || len(encoded) > 24<<10 {
			return nil, fmt.Errorf("lua reference section exceeds budget: %s", skill.ID)
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
