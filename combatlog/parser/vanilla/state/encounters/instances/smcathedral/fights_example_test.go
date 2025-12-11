package smcathedral_test

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/smcathedral"
)

// ExampleAggregateFights demonstrates how to use the fight aggregator
// to group hostile creature activity into separate combat encounters.
func ExampleAggregateFights() {
	// In a real scenario, you would collect characters from parsing combat logs.
	// Here we'll create a simple example with mock data.

	// The aggregator processes encounters.Characters, which is typically
	// populated during combat log parsing. Each character tracks their
	// activity periods (when they were active in combat).

	characters := encounters.NewCharacters()

	// For demonstration, let's assume we have processed a combat log and
	// characters have been tracked. The AggregateFights function will:
	// 1. Filter to only hostile creatures (based on CathedralHostiles)
	// 2. Group overlapping activity periods into fights
	// 3. Return a slice of Fight structs

	fights := smcathedral.AggregateFights(characters)

	fmt.Printf("Found %d fights\n", len(fights))

	for i, fight := range fights {
		duration := fight.End.Sub(fight.Start)
		fmt.Printf("Fight %d: %d hostiles, duration: %v\n",
			i+1, len(fight.Hostiles), duration)

		// Each fight contains all hostile characters that participated
		for _, hostile := range fight.Hostiles {
			fmt.Printf("  - Hostile %s with %d activity periods\n",
				hostile.ID, len(hostile.Activity))
		}
	}

	// Output:
	// Found 0 fights
}

// ExampleAggregateFightsWithCooldown demonstrates using a custom cooldown period.
// The cooldown determines how long after a fight ends before a new hostile activity
// is considered a separate fight.
func ExampleAggregateFightsWithCooldown() {
	characters := encounters.NewCharacters()

	// Use a 30-second cooldown instead of the default 60 seconds.
	// This means if hostile activity resumes within 30 seconds of the last
	// hostile becoming inactive, it's considered part of the same fight.
	customCooldown := 30 * time.Second
	fights := smcathedral.AggregateFightsWithCooldown(characters, customCooldown)

	fmt.Printf("Found %d fights with 30s cooldown\n", len(fights))

	// Output:
	// Found 0 fights with 30s cooldown
}

// ExampleFight_typical shows what a typical fight structure looks like.
func ExampleFight_typical() {
	// A Fight represents a single combat encounter
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	fight := smcathedral.Fight{
		Start: baseTime,
		End:   baseTime.Add(2 * time.Minute),
		Hostiles: []smcathedral.CharacterFight{
			{
				// First hostile was active for the entire fight
				Activity: []encounters.Active{
					{
						Start: &encounters.ExplainedTimestamp{
							Timestamp:   messages.TimedOut(baseTime),
							Explanation: "damage",
						},
						End: &encounters.ExplainedTimestamp{
							Timestamp:   messages.TimedOut(baseTime.Add(2 * time.Minute)),
							Explanation: "slain",
						},
					},
				},
			},
			{
				// Second hostile joined 30 seconds in
				Activity: []encounters.Active{
					{
						Start: &encounters.ExplainedTimestamp{
							Timestamp:   messages.TimedOut(baseTime.Add(30 * time.Second)),
							Explanation: "damage",
						},
						End: &encounters.ExplainedTimestamp{
							Timestamp:   messages.TimedOut(baseTime.Add(2 * time.Minute)),
							Explanation: "slain",
						},
					},
				},
			},
		},
	}

	duration := fight.End.Sub(fight.Start)
	fmt.Printf("Fight duration: %v\n", duration)
	fmt.Printf("Hostiles involved: %d\n", len(fight.Hostiles))

	// Output:
	// Fight duration: 2m0s
	// Hostiles involved: 2
}
