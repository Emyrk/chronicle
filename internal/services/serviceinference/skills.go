package serviceinference

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

const (
	chronicleConceptsSkillID = "chronicle-concepts"
	instanceSearchSkillID    = "instance-search"
)

type runtimeSkill struct {
	ID, Name, Version, Instructions string
	Tools                           []ToolDefinition
}

var runtimeSkills = map[string]runtimeSkill{
	chronicleConceptsSkillID: {
		ID: chronicleConceptsSkillID, Name: "Chronicle log concepts", Version: "1",
		Instructions: `Chronicle analyzes uploaded World of Warcraft combat logs. A raid is a group activity; a dungeon is a smaller group activity. An instance in Chronicle is one uploaded run/log, not the game world's dungeon or raid zone. One run can contain several encounters and multiple attempts of the same boss. An encounter is one fight/pull; a kill and a wipe are different outcomes. Trash fights are not boss kills.
A parse is a comparison score, not the raw damage, healing, or kill time. A player performance parse compares a player's performance on a boss against an eligible cohort for that metric (for example DPS or HPS). A kill-time parse compares how quickly a boss was killed; a clear-time parse concerns the run's progression across required bosses. Percentiles and eligibility depend on the scoring cohort and policy: never invent a parse, compare unlike cohorts, or imply a high parse proves a particular strategy. Distinguish a boss fight, an entire uploaded run, and a dungeon/raid zone when answering.
Use Chronicle tools when a question needs current account-specific data; general definitions alone do not establish that a log or parse exists.`,
	},
	instanceSearchSkillID: {
		ID: instanceSearchSkillID, Name: "Chronicle instance search", Version: "1",
		Instructions: `Use this skill to build a link to a Chronicle search for raid or dungeon runs, rosters, fights, parses, or progression. This assistant cannot run the search or see results. Never claim matches exist; explain the proposed filters and give the returned URL. Links preserve the current site/tenant and filters only, not pagination or limits. Do not fabricate links: call build_instance_search_link.
First call describe_instance_search if you need the current field registry, allowed operators, value types, or limits. Then build a JSON where node using and/or/not, any_player/count_players, or any_encounter/count_encounters. Fields with instance.* are top-level; player.* fields go inside player quantifiers; encounter.* inside encounter quantifiers; quantifiers cannot nest. Predicates inside one any_player or count_players subtree apply to the same player; similarly for encounters.
For example, "3+ priests" is count_players(where player.class = PRIEST, op >=, value 3). "Killed Rag without wipes" combines an encounter with name Ragnaros and killed=true with NOT an encounter matching Ragnaros and outcome=wipe. "90+ kill parse on Rag and Domo" uses instance.kill_time_parse with bosses [Ragnaros, Majordomo Executus] and match=each.
Text matching is case-insensitive. Missing values do not satisfy = or !=; use not when missing values should also count. Per-fight player fields default to boss kills; set on=trash or on=any only when requested. If validation rejects a query, revise it or explain the limitation rather than inventing a URL.`,
		Tools: []ToolDefinition{
			{Name: "describe_instance_search", Description: "Return current Chronicle instance-search fields, operators, and limits. Does not run a search.", Parameters: json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)},
			{Name: "build_instance_search_link", Description: "Validate a JSON search tree and return a link to open it in Chronicle search. Does not run the search or return results.", Parameters: json.RawMessage(`{"type":"object","properties":{"where":{"type":"object","description":"One instance-search node: and, or, not, any_player, count_players, any_encounter, count_encounters, or field predicate."}},"required":["where"],"additionalProperties":false}`)},
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

func withRuntimeSkills(a assistant) (assistant, error) { return composeRuntimeSkills(a, runtimeSkills) }

func composeRuntimeSkills(a assistant, registry map[string]runtimeSkill) (assistant, error) {
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
		skill, ok := registry[id]
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

func assistantAllowsTool(a assistant, name string) bool {
	for _, tool := range a.Tools {
		if tool.Name == name {
			return true
		}
	}
	return false
}
