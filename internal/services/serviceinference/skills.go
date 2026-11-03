package serviceinference

import (
	"fmt"
	"slices"
	"strings"
)

const chronicleConceptsSkillID = "chronicle-concepts"

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
