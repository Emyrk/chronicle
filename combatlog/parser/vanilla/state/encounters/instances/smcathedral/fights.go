package smcathedral

import (
	"sort"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
)

// Fight represents a single combat encounter with one or more hostile creatures.
// A fight starts when the first hostile becomes active and ends when the last
// hostile becomes inactive. Hostiles with overlapping activity periods are
// grouped into the same fight.
type Fight struct {
	// Hostiles contains all characters that participated in this fight.
	// Each CharacterFight contains all activity periods from that character
	// that belong to this fight.
	Hostiles []CharacterFight

	// Start is the earliest start time across all hostile activity periods.
	Start time.Time

	// End is the latest end time across all hostile activity periods.
	End time.Time
}

// CharacterFight represents all activity periods from a single character
// that belong to the same fight.
type CharacterFight struct {
	ID       guid.GUID
	Activity []encounters.Active
}

// AggregateFights takes a map of characters and aggregates them into separate
// fights based on overlapping activity periods. Only characters that match
// the hostile entry IDs (from CathedralHostiles) are included.
//
// The algorithm:
// 1. Filter characters to only include hostiles (by Entry ID)
// 2. Collect all activity periods with their character IDs
// 3. Sort periods by start time
// 4. Merge overlapping periods into fights
//
// Activities are considered part of the same fight if they start within
// the cooldown window (60 seconds) of the current fight's end time.
func AggregateFights(characters encounters.Characters) []Fight {
	return AggregateFightsWithCooldown(characters, 60*time.Second)
}

// AggregateFightsWithCooldown is like AggregateFights but allows customizing
// the cooldown period. Activities that start within 'cooldown' duration
// after a fight ends are considered part of the same fight.
func AggregateFightsWithCooldown(characters encounters.Characters, cooldown time.Duration) []Fight {
	hostileEntries := CathedralHostiles()

	// Step 1: Filter to only hostile characters and collect their activity periods
	type activityWithChar struct {
		charID   guid.GUID
		activity encounters.Active
	}

	var allActivities []activityWithChar
	for id, char := range characters {
		// Check if this character is a hostile
		entry, ok := id.GetEntry()
		if !ok {
			continue // Skip players and other non-creatures
		}

		if _, isHostile := hostileEntries[entry]; !isHostile {
			continue // Skip non-hostile creatures
		}

		// Collect all completed activity periods for this character
		for _, period := range char.Activity.Periods {
			// Only include periods that have ended
			if period.End != nil {
				allActivities = append(allActivities, activityWithChar{
					charID:   id,
					activity: period,
				})
			}
		}
	}

	if len(allActivities) == 0 {
		return nil
	}

	// Step 2: Sort activities by start time
	sort.Slice(allActivities, func(i, j int) bool {
		return allActivities[i].activity.Start.Timestamp.Date().
			Before(allActivities[j].activity.Start.Timestamp.Date())
	})

	// Step 3: Merge overlapping activities into fights
	var fights []Fight

	// Start the first fight
	currentFight := Fight{
		Start:    allActivities[0].activity.Start.Timestamp.Date(),
		End:      allActivities[0].activity.End.Timestamp.Date(),
		Hostiles: make([]CharacterFight, 0),
	}
	currentFightActivities := make(map[guid.GUID][]encounters.Active)
	currentFightActivities[allActivities[0].charID] = []encounters.Active{allActivities[0].activity}

	// Process remaining activities
	for i := 1; i < len(allActivities); i++ {
		activity := allActivities[i]
		activityStart := activity.activity.Start.Timestamp.Date()
		activityEnd := activity.activity.End.Timestamp.Date()

		// Check if this activity belongs to the current fight
		// It belongs if it starts within the cooldown period after the fight ends
		fightEndWithCooldown := currentFight.End.Add(cooldown)
		if activityStart.Before(fightEndWithCooldown) || activityStart.Equal(fightEndWithCooldown) {
			// This activity belongs to the current fight
			currentFightActivities[activity.charID] = append(
				currentFightActivities[activity.charID],
				activity.activity,
			)

			// Extend the fight's end time if necessary
			if activityEnd.After(currentFight.End) {
				currentFight.End = activityEnd
			}

			// Update start time if this activity started earlier
			if activityStart.Before(currentFight.Start) {
				currentFight.Start = activityStart
			}
		} else {
			// This activity does not overlap - finalize the current fight
			// and start a new one
			finalizeFight(&currentFight, currentFightActivities)
			fights = append(fights, currentFight)

			// Start a new fight
			currentFight = Fight{
				Start:    activityStart,
				End:      activityEnd,
				Hostiles: make([]CharacterFight, 0),
			}
			currentFightActivities = make(map[guid.GUID][]encounters.Active)
			currentFightActivities[activity.charID] = []encounters.Active{activity.activity}
		}
	}

	// Don't forget to finalize the last fight
	finalizeFight(&currentFight, currentFightActivities)
	fights = append(fights, currentFight)

	return fights
}

// finalizeFight converts the activity map into the Hostiles slice for a fight.
func finalizeFight(fight *Fight, activities map[guid.GUID][]encounters.Active) {
	fight.Hostiles = make([]CharacterFight, 0, len(activities))

	for charID, periods := range activities {
		fight.Hostiles = append(fight.Hostiles, CharacterFight{
			ID:       charID,
			Activity: periods,
		})
	}

	// Sort hostiles by ID for consistent output
	sort.Slice(fight.Hostiles, func(i, j int) bool {
		return fight.Hostiles[i].ID < fight.Hostiles[j].ID
	})
}
