//go:build wasm
// +build wasm

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

	"github.com/Emyrk/chronicle/combatlog"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/damagemetric"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

func main() {
	js.Global().Set("parseWoWLogs", js.FuncOf(parseLogsFunc))
	fmt.Println("WASM Go parser initialized")
	<-make(chan bool) // Keep the program running
}

// TimelineOutput is the final output structure
type TimelineOutput struct {
	Instances []InstanceData `json:"instances"`
}

// InstanceData represents all data for a single instance
type InstanceData struct {
	Name       string          `json:"name"`
	ZoneID     string          `json:"zoneId"`
	ZoneName   string          `json:"zoneName"`
	Characters []CharacterData `json:"characters"`
	Encounters []EncounterData `json:"encounters"`
}

// CharacterData represents a character in an instance
type CharacterData struct {
	CharacterID   string           `json:"characterId"`
	CharacterName string           `json:"characterName"`
	IsPlayer      bool             `json:"isPlayer"`
	Class         string           `json:"class,omitempty"`
	Periods       []ActivityPeriod `json:"periods"`
}

// ActivityPeriod represents a time period when a character was active
type ActivityPeriod struct {
	Start       time.Time  `json:"start"`
	End         *time.Time `json:"end"` // nil if still active
	StartReason string     `json:"startReason"`
	EndReason   string     `json:"endReason,omitempty"`
}

// EncounterData represents a fight/encounter with damage tracking
type EncounterData struct {
	Name     string        `json:"name"`
	Type     string        `json:"type"`
	Start    time.Time     `json:"start"`
	End      time.Time     `json:"end"`
	Duration float64       `json:"duration"` // in seconds
	IsKill   bool          `json:"isKill"`
	Hostiles []HostileData `json:"hostiles"`
	Damage   DamageData    `json:"damage"`
}

// HostileData represents a hostile character in an encounter
type HostileData struct {
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
	Slain       bool      `json:"slain"`
}

// DamageData represents damage tracking for an encounter
type DamageData struct {
	TotalDealt map[string]UnitDamage `json:"totalDealt"` // keyed by GUID
}

// UnitDamage represents damage from a single unit
type UnitDamage struct {
	UnitID   string           `json:"unitId"`
	UnitName string           `json:"unitName"`
	Class    string           `json:"class,omitempty"`
	IsPlayer bool             `json:"isPlayer"`
	Total    int64            `json:"total"`
	DPS      float64          `json:"dps"`
	Sources  map[string]int64 `json:"sources"` // spell/ability name -> damage
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

	// Use the new CombatLogs function
	output, err := combatlog.CombatLogs(context.Background(), logger, combatLogReader, rawCombatLogReader)
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to parse combat logs: %v", err),
		}
	}

	// Convert output to timeline format
	timeline := convertOutputToTimeline(output)

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

func convertOutputToTimeline(output *combatlog.Output) TimelineOutput {
	var timeline TimelineOutput
	timeline.Instances = make([]InstanceData, 0, len(output.Instances))

	for zoneID, instOutput := range output.Instances {
		// Get zone info from first encounter if available
		zoneName := ""
		instanceName := ""

		if len(instOutput.Encounters) > 0 {
			// We need to find the instance to get the zone info
			// For now, we'll use the zone ID
			zoneName = zoneID
			instanceName = zoneID
		}

		instData := InstanceData{
			Name:       instanceName,
			ZoneID:     zoneID,
			ZoneName:   zoneName,
			Characters: make([]CharacterData, 0),
			Encounters: make([]EncounterData, 0, len(instOutput.Encounters)),
		}

		// Convert encounters (fights)
		for _, encounter := range instOutput.Encounters {
			encounterData := convertEncounterToData(encounter, instOutput.DamageTracking, output.Units)
			instData.Encounters = append(instData.Encounters, encounterData)
		}

		// Collect all unique characters from encounters
		characterMap := make(map[string]CharacterData)
		for _, encounter := range instOutput.Encounters {
			for charID, charFight := range encounter.Combat.Hostiles {
				if _, exists := characterMap[charID.String()]; !exists {
					charData := convertCharacterData(charID, output.Units)

					// Add periods from this encounter
					for _, period := range charFight.Activity {
						activityPeriod := ActivityPeriod{
							Start:       period.Start.Timestamp.Date(),
							StartReason: period.Start.Reason,
						}
						if period.End != nil {
							endTime := period.End.Timestamp.Date()
							activityPeriod.End = &endTime
							activityPeriod.EndReason = period.End.Reason
						}
						charData.Periods = append(charData.Periods, activityPeriod)
					}

					characterMap[charID.String()] = charData
				}
			}
		}

		// Convert map to slice
		for _, char := range characterMap {
			instData.Characters = append(instData.Characters, char)
		}

		timeline.Instances = append(timeline.Instances, instData)
	}

	return timeline
}

func convertCharacterData(gid guid.GUID, units *unitdb.Units) CharacterData {
	char := CharacterData{
		CharacterID: gid.String(),
		IsPlayer:    gid.IsPlayer(),
		Periods:     make([]ActivityPeriod, 0),
	}

	// Try to get character info from unitdb
	if unitInfo, ok := units.Get(gid); ok {
		char.CharacterName = unitInfo.Name
	} else if player, ok := units.Players[gid]; ok {
		char.CharacterName = player.Name
		char.Class = player.HeroClass.String()
	} else {
		char.CharacterName = gid.String()
	}

	return char
}

func convertEncounterToData(encounter instances.Encounter, dmgTracking *damagemetric.Damage, units *unitdb.Units) EncounterData {
	duration := encounter.Combat.End.Sub(encounter.Combat.Start).Seconds()

	encounterData := EncounterData{
		Name:     encounter.Name,
		Type:     encounter.Type.String(),
		Start:    encounter.Combat.Start,
		End:      encounter.Combat.End,
		Duration: duration,
		IsKill:   encounter.IsKill,
		Hostiles: make([]HostileData, 0, len(encounter.Combat.Hostiles)),
		Damage:   DamageData{TotalDealt: make(map[string]UnitDamage)},
	}

	// Convert hostile characters
	for charID, charFight := range encounter.Combat.Hostiles {
		charName := charID.String()
		if unitInfo, ok := units.Get(charID); ok {
			charName = unitInfo.Name
		}

		hostileData := HostileData{
			CharacterID:   charID.String(),
			CharacterName: charName,
			Periods:       make([]FightPeriod, 0, len(charFight.Activity)),
		}

		for _, activity := range charFight.Activity {
			period := FightPeriod{
				Start:       activity.Start.Timestamp.Date(),
				End:         activity.End.Timestamp.Date(),
				StartReason: activity.Start.Reason,
				EndReason:   activity.End.Reason,
				Slain:       activity.Slain,
			}
			hostileData.Periods = append(hostileData.Periods, period)
		}

		encounterData.Hostiles = append(encounterData.Hostiles, hostileData)
	}

	// Get damage summary for this encounter
	if dmgTracking != nil {
		summary, err := dmgTracking.Summary(encounter.Combat.Start, encounter.Combat.End)
		if err == nil {
			for unitGUID, sources := range summary.TotalDealt {
				var total int64
				for _, amount := range sources {
					total += int64(amount)
				}

				// Convert sources from int32 to int64
				sourcesInt64 := make(map[string]int64)
				for source, amount := range sources {
					sourcesInt64[source] = int64(amount)
				}

				dps := 0.0
				if duration > 0 {
					dps = float64(total) / duration
				}

				unitDamage := UnitDamage{
					UnitID:   unitGUID.String(),
					IsPlayer: unitGUID.IsPlayer(),
					Total:    total,
					DPS:      dps,
					Sources:  sourcesInt64,
				}

				// Get unit info
				if unitInfo, ok := units.Get(unitGUID); ok {
					unitDamage.UnitName = unitInfo.Name
				} else if player, ok := units.Players[unitGUID]; ok {
					unitDamage.UnitName = player.Name
					unitDamage.Class = player.HeroClass.String()
				} else {
					unitDamage.UnitName = unitGUID.String()
				}

				encounterData.Damage.TotalDealt[unitGUID.String()] = unitDamage
			}
		}
	}

	return encounterData
}
