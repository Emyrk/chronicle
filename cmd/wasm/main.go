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
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/fight"
)

func main() {
	js.Global().Set("parseWoWLogs", js.FuncOf(parseLogsFunc))
	fmt.Println("WASM Go parser initialized")
	<-make(chan bool) // Keep the program running
}

// CharacterTimeline represents a character's activity in an instance
type CharacterTimeline struct {
	CharacterID   string           `json:"characterId"`
	CharacterName string           `json:"characterName"`
	IsPlayer      bool             `json:"isPlayer"`
	Periods       []ActivityPeriod `json:"periods"`
}

// ActivityPeriod represents a time period when a character was active
type ActivityPeriod struct {
	Start       time.Time  `json:"start"`
	End         *time.Time `json:"end"` // nil if still active
	StartReason string     `json:"startReason"`
	EndReason   string     `json:"endReason,omitempty"`
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
	Fights    []InstanceFights   `json:"fights"`
}

// InstanceFights represents all fights in an instance
type InstanceFights struct {
	InstanceName string      `json:"instanceName"`
	Fights       []FightData `json:"fights"`
}

// FightData represents a single fight with hostiles
type FightData struct {
	Start    time.Time            `json:"start"`
	End      time.Time            `json:"end"`
	Duration float64              `json:"duration"` // in seconds
	Hostiles []FightCharacterData `json:"hostiles"`
}

// FightCharacterData represents a character in a fight
type FightCharacterData struct {
	CharacterID   string        `json:"characterId"`
	CharacterName string        `json:"characterName"`
	Periods       []FightPeriod `json:"periods"`
}

// FightPeriod represents an activity period within a fight
type FightPeriod struct {
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
	StartReason string    `json:"startReason"`
	EndReason   string    `json:"endReason"`
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
	output.Fights = make([]InstanceFights, 0, len(s.Instances))

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

		// Aggregate fights for this instance
		fights, _ := fight.AggregateFights(inst)
		instanceFights := convertFightsToData(inst.Name(), fights, s)
		output.Fights = append(output.Fights, instanceFights)
	}

	return output
}

func convertCharacterToTimeline(gid guid.GUID, char character.Character, s *state.State) CharacterTimeline {
	timeline := CharacterTimeline{
		CharacterID: gid.String(),
		IsPlayer:    gid.IsPlayer(),
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

	// Convert activity periods using the Character interface
	periods := char.Periods()
	for _, period := range periods {
		activityPeriod := ActivityPeriod{}

		if period.Start != nil {
			activityPeriod.Start = period.Start.Timestamp.Date()
			activityPeriod.StartReason = period.Start.Reason
		}

		if period.End != nil {
			endTime := period.End.Timestamp.Date()
			activityPeriod.End = &endTime
			activityPeriod.EndReason = period.End.Reason
		}

		timeline.Periods = append(timeline.Periods, activityPeriod)
	}

	return timeline
}

func convertFightsToData(instanceName string, fights []fight.Fight, s *state.State) InstanceFights {
	instanceFights := InstanceFights{
		InstanceName: instanceName,
		Fights:       make([]FightData, 0, len(fights)),
	}

	for _, f := range fights {
		duration := f.End.Sub(f.Start).Seconds()

		fightData := FightData{
			Start:    f.Start,
			End:      f.End,
			Duration: duration,
			Hostiles: make([]FightCharacterData, 0, len(f.Hostiles)),
		}

		// Convert each hostile character
		for charID, charFight := range f.Hostiles {
			charName := charID.String()
			// Try to get character name from unitdb
			if unitInfo, ok := s.Units.Get(charID); ok {
				charName = unitInfo.Name
			}

			charData := FightCharacterData{
				CharacterID:   charID.String(),
				CharacterName: charName,
				Periods:       make([]FightPeriod, 0, len(charFight.Activity)),
			}

			// Convert activity periods
			for _, activity := range charFight.Activity {
				period := FightPeriod{
					Start:       activity.Start.Timestamp.Date(),
					End:         activity.End.Timestamp.Date(),
					StartReason: activity.Start.Reason,
					EndReason:   activity.End.Reason,
				}
				charData.Periods = append(charData.Periods, period)
			}

			fightData.Hostiles = append(fightData.Hostiles, charData)
		}

		instanceFights.Fights = append(instanceFights.Fights, fightData)
	}

	return instanceFights
}
