package serviceinference

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

const instanceSearchSkillID = "instance-search"

type runtimeSkill struct {
	ID           string
	Name         string
	Version      string
	Instructions string
	Tools        []ToolDefinition
}

var runtimeSkills = map[string]runtimeSkill{
	instanceSearchSkillID: {
		ID:      instanceSearchSkillID,
		Name:    "Chronicle instance search",
		Version: "1",
		Instructions: `Use this skill for questions about raid or dungeon logs, players, guilds, encounters, compositions, parses, clear times, or progression.
Call describe_instance_search when you need the current field registry, operators, or limits, then call search_instances with a bounded JSON query tree.
Field scope is strict: instance.* fields are top-level, player.* fields belong inside any_player or count_players, and encounter.* fields belong inside any_encounter or count_encounters. Quantifiers cannot nest.
Predicates inside one any_player or count_players subtree refer to the same player. Use one quantifier when the question requires one player to satisfy several conditions.
For common questions: "3+ priests" means count_players(player.class = PRIEST) >= 3; "killed Rag without wipes" combines one matching killed encounter with NOT a matching wipe encounter; "90+ kill parse on Rag and Domo" uses instance.kill_time_parse with both bosses and match=each.
Text and enum matching ignores case. Missing data does not satisfy = or !=; wrap a predicate in not when missing values should also count as not matching.
Per-fight player fields use boss kills by default. Set on=trash or on=any only when the question asks for those fights.
Never invent results or links. Summarize only returned rows and include returned Chronicle URLs when useful.`,
		Tools: []ToolDefinition{
			{Name: "describe_instance_search", Description: "Describe the selected Chronicle tenant and current bounded instance-search fields, operators, and limits.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
			{Name: "search_instances", Description: "Search visible Chronicle raid and dungeon instances in the selected tenant with a bounded JSON query tree.", Parameters: json.RawMessage(`{"type":"object","properties":{"where":{"type":"object","description":"Instance-search node: exactly one of and, or, not, any_player, count_players, any_encounter, count_encounters, or field."},"limit":{"type":"integer","minimum":1,"maximum":10}},"additionalProperties":false}`)},
		},
	},
}

func debugRuntimeSkills(a assistant) []runtimeSkill {
	out := make([]runtimeSkill, 0, len(a.Skills))
	for _, id := range a.Skills {
		if skill, ok := runtimeSkills[id]; ok {
			out = append(out, skill)
		}
	}
	return out
}

func withRuntimeSkills(a assistant) (assistant, error) {
	if len(a.Skills) == 0 {
		return a, nil
	}
	a.Tools = slices.Clone(a.Tools)
	seenSkills := make(map[string]struct{}, len(a.Skills))
	seenTools := make(map[string]struct{}, len(a.Tools))
	for _, tool := range a.Tools {
		seenTools[tool.Name] = struct{}{}
	}
	var prompt strings.Builder
	for _, id := range a.Skills {
		if _, exists := seenSkills[id]; exists {
			return assistant{}, fmt.Errorf("duplicate runtime skill %q", id)
		}
		seenSkills[id] = struct{}{}
		skill, ok := runtimeSkills[id]
		if !ok {
			return assistant{}, fmt.Errorf("unknown runtime skill %q", id)
		}
		prompt.WriteString("\n\n## Skill: ")
		prompt.WriteString(skill.Name)
		prompt.WriteString("\n")
		prompt.WriteString(skill.Instructions)
		for _, tool := range skill.Tools {
			if _, exists := seenTools[tool.Name]; exists {
				return assistant{}, fmt.Errorf("runtime skill %q duplicates tool %q", id, tool.Name)
			}
			seenTools[tool.Name] = struct{}{}
			a.Tools = append(a.Tools, tool)
		}
	}
	a.System += prompt.String()
	return a, nil
}
