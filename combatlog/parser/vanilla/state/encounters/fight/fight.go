package fight

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/diagnostic"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
)

// Fight represents a single combat encounter with one or more hostile creatures.
// A fight starts when the first hostile becomes active and ends when the last
// hostile becomes inactive. Hostiles with overlapping activity periods are
// grouped into the same fight.
type Fight struct {
	// Hostiles contains all hostile characters that participated in this fight.
	// Each CharacterFight contains all activity periods from that character
	// that belong to this fight.
	Hostiles map[guid.GUID]CharacterFight

	// Start is the earliest start time across all hostile activity periods.
	Start time.Time

	// End is the latest end time across all hostile activity periods.
	End time.Time
}

func (f Fight) NamedString(db *unitdb.Units) string {
	var str strings.Builder
	str.WriteString(fmt.Sprintf("Fight: against %d units\n", len(f.Hostiles)))
	str.WriteString(fmt.Sprintf("  Start: %s\n", f.Start.Format("15:04:05.000")))
	str.WriteString(fmt.Sprintf("  End:   %s\n", f.End.Format("15:04:05.000")))
	str.WriteString("  Hostiles:\n")
	for charID, charFight := range f.Hostiles {
		unit, ok := db.Get(charID)
		unitName := "Unknown"
		if !ok {
			unitName = unit.Name
		}
		str.WriteString(fmt.Sprintf("    - %s (ID: %s) with %d activity periods\n", unitName, charID.String(), len(charFight.Activity)))
		for _, activity := range charFight.Activity {
			str.WriteString(fmt.Sprintf("        * From %s to %s\n",
				activity.Start.Timestamp.Date().Format("15:04:05.000"),
				activity.End.Timestamp.Date().Format("15:04:05.000"),
			))
		}
	}
	return str.String()
}

// CharacterFight represents all activity periods from a single character
// that belong to the same fight.
type CharacterFight struct {
	ID       guid.GUID // TODO: This ID is redundant since it's also the map key in Fight.Hostiles
	Activity []period.Period
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
func AggregateFights(inst encounters.Instance) ([]Fight, diagnostic.Diagnostics) {
	characters := inst.CharactersList()
	var diags diagnostic.Diagnostics

	// Step 1: Filter to only hostile characters and collect their activity periods
	type activityWithChar struct {
		charID   guid.GUID
		activity period.Period
	}

	var allActivities []activityWithChar
	for id, char := range characters {
		info := inst.Identify(id)
		if !info.Hostile {
			// Skip non-hostile characters
			continue
		}

		// Collect all completed activity periods for this character
		for _, prd := range char.Periods() {
			// Only include periods that have ended
			// If a period has no end... what do we do?
			if prd.IsActive() {
				diags.Append(&diagnostic.Diagnostic{
					Severity: diagnostic.DiagWarning,
					Summary:  "Skipping active period with no end time",
					Detail:   fmt.Sprintf("Character %s has an active period with no end time; skipping it for fight aggregation", id.String()),
				})
				continue
			}

			allActivities = append(allActivities, activityWithChar{
				charID:   id,
				activity: prd,
			})
		}
	}

	if len(allActivities) == 0 {
		return []Fight{}, diags
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
		Hostiles: make(map[guid.GUID]CharacterFight),
	}

	currentFightActivities := make(map[guid.GUID][]period.Period)
	currentFightActivities[allActivities[0].charID] = []period.Period{allActivities[0].activity}

	// Process remaining activities
	for i := 1; i < len(allActivities); i++ {
		activity := allActivities[i]
		activityStart := activity.activity.Start.Timestamp.Date()
		activityEnd := activity.activity.End.Timestamp.Date()

		// Check if this activity belongs to the current fight.
		// It belongs if it starts within the cooldown period after the fight ends.
		fightEndWithCooldown := currentFight.End.Add(time.Millisecond * 100)
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
				Hostiles: make(map[guid.GUID]CharacterFight),
			}
			currentFightActivities = make(map[guid.GUID][]period.Period)
			currentFightActivities[activity.charID] = []period.Period{activity.activity}
		}
	}

	// Don't forget to finalize the last fight
	finalizeFight(&currentFight, currentFightActivities)
	fights = append(fights, currentFight)

	return fights, diags
}

// finalizeFight converts the activity map into the Hostiles slice for a fight.
func finalizeFight(fight *Fight, activities map[guid.GUID][]period.Period) {
	// TODO: Trim back timeouts to last activity?
	fight.Hostiles = make(map[guid.GUID]CharacterFight, len(activities))
	for charID, periods := range activities {
		fight.Hostiles[charID] = CharacterFight{
			ID:       charID,
			Activity: periods,
		}
	}
}
