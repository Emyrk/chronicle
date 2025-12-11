package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"syscall/js"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
)

func main() {
	js.Global().Set("parseWoWLogs", js.FuncOf(parseLogsFunc))
	fmt.Println("WASM Go parser initialized")
	<-make(chan bool) // Keep the program running
}

// CharacterTimeline represents a character's activity in an instance
type CharacterTimeline struct {
	CharacterID   string            `json:"characterId"`
	CharacterName string            `json:"characterName"`
	Periods       []ActivityPeriod  `json:"periods"`
}

// ActivityPeriod represents a time period when a character was active
type ActivityPeriod struct {
	Start       time.Time `json:"start"`
	End         *time.Time `json:"end"` // nil if still active
	StartReason string    `json:"startReason"`
	EndReason   string    `json:"endReason,omitempty"`
}

// InstanceTimeline represents all character activity in an instance
type InstanceTimeline struct {
	Name       string              `json:"name"`
	ZoneName   string              `json:"zoneName"`
	Characters []CharacterTimeline `json:"characters"`
}

// TimelineOutput is the final output structure
type TimelineOutput struct {
	Instances []InstanceTimeline `json:"instances"`
}

func parseLogsFunc(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		return map[string]interface{}{
			"error": "Expected 2 arguments: combatLog and rawCombatLog",
		}
	}

	// Get the two file contents as byte arrays
	combatLogBytes := make([]byte, args[0].Get("byteLength").Int())
	js.CopyBytesToGo(combatLogBytes, args[0])

	rawCombatLogBytes := make([]byte, args[1].Get("byteLength").Int())
	js.CopyBytesToGo(rawCombatLogBytes, args[1])

	// Create readers from the byte arrays
	combatLogReader := bytes.NewReader(combatLogBytes)
	rawCombatLogReader := bytes.NewReader(rawCombatLogBytes)

	// Create a simple logger that writes to console
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelError, // Only show errors in WASM
	}))

	// Create the merger and parser
	m := vanilla.Merger(logger)
	liner, scan, err := m.LineScanner(context.Background(), combatLogReader, rawCombatLogReader)
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to create line scanner: %v", err),
		}
	}

	p := vanilla.NewFromScanner(logger, liner, scan)
	output := state.New(logger)
	err = output.Consume(context.Background(), p)
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to consume parser: %v", err),
		}
	}

	// Convert state to timeline format
	timeline := convertStateToTimeline(output)

	// Convert to JSON
	timelineJSON, err := json.MarshalIndent(timeline, "", "  ")
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to marshal timeline: %v", err),
		}
	}

	return map[string]interface{}{
		"success":  true,
		"timeline": string(timelineJSON),
	}
}

func convertStateToTimeline(s *state.State) TimelineOutput {
	var output TimelineOutput
	output.Instances = make([]InstanceTimeline, 0, len(s.Instances))

	for _, inst := range s.Instances {
		timeline := InstanceTimeline{
			Name:       inst.Name(),
			ZoneName:   "", // We'll need to store this if needed
			Characters: make([]CharacterTimeline, 0),
		}

		// Get characters from the instance
		characters := inst.CharactersList()
		for gid, character := range characters {
			charTimeline := convertCharacterToTimeline(gid, character, s)
			timeline.Characters = append(timeline.Characters, charTimeline)
		}

		output.Instances = append(output.Instances, timeline)
	}

	return output
}

func convertCharacterToTimeline(gid guid.GUID, char *encounters.Character, s *state.State) CharacterTimeline {
	timeline := CharacterTimeline{
		CharacterID: gid.String(),
		Periods:     make([]ActivityPeriod, 0),
	}

	// Try to get character name from unitdb
	if unitInfo, ok := s.Units.Get(gid); ok {
		timeline.CharacterName = unitInfo.Name
	} else if player, ok := s.Units.Players[gid]; ok {
		timeline.CharacterName = player.Name
	} else {
		timeline.CharacterName = gid.String()
	}

	// Convert activity periods
	if char.Activity != nil {
		for _, period := range char.Activity.Periods {
			activityPeriod := ActivityPeriod{}

			if period.Start != nil {
				activityPeriod.Start = period.Start.Timestamp.Date()
				activityPeriod.StartReason = period.Start.Explanation
			}

			if period.End != nil {
				endTime := period.End.Timestamp.Date()
				activityPeriod.End = &endTime
				activityPeriod.EndReason = period.End.Explanation
			}

			timeline.Periods = append(timeline.Periods, activityPeriod)
		}
	}

	return timeline
}
