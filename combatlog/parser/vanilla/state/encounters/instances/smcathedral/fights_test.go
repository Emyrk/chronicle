package smcathedral

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
)

// Helper function to create a test character with activity periods
func createTestCharacter(id guid.GUID, periods []struct {
	start time.Time
	end   time.Time
}) *encounters.Character {
	char := encounters.NewCharacter(id, time.Now())
	char.Activity.Periods = make([]encounters.Active, len(periods))

	for i, p := range periods {
		char.Activity.Periods[i] = encounters.Active{
			Start: &encounters.ExplainedTimestamp{
				Timestamp:   messages.TimedOut(p.start),
				Explanation: "test",
			},
			End: &encounters.ExplainedTimestamp{
				Timestamp:   messages.TimedOut(p.end),
				Explanation: "test",
			},
		}
	}

	return char
}

// Helper to create a hostile GUID (creature with entry ID)
func createHostileGUID(entry uint32) guid.GUID {
	// Create a creature GUID with the given entry ID
	// Entry is stored rotated left by 24 bits in the lower portion of the GUID
	// High bits 0xF130 indicate a creature type
	entryBits := uint64(entry) & 0x0000000000FFFFFF
	guidWithEntry := (entryBits << 24) | (entryBits >> 40) // Rotate left by 24
	return guid.GUID(0xF130000000000000 | guidWithEntry)
}

func TestAggregateFights_SingleHostile(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Scarlet Monk (4540)
	monkID := createHostileGUID(4540)
	characters[monkID] = createTestCharacter(monkID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(30 * time.Second)},
	})

	fights := AggregateFights(characters)

	if len(fights) != 1 {
		t.Fatalf("expected 1 fight, got %d", len(fights))
	}

	fight := fights[0]
	if len(fight.Hostiles) != 1 {
		t.Fatalf("expected 1 hostile in fight, got %d", len(fight.Hostiles))
	}

	if fight.Start != baseTime {
		t.Errorf("expected fight start %v, got %v", baseTime, fight.Start)
	}

	expectedEnd := baseTime.Add(30 * time.Second)
	if fight.End != expectedEnd {
		t.Errorf("expected fight end %v, got %v", expectedEnd, fight.End)
	}
}

func TestAggregateFights_OverlappingHostiles(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Scarlet Monk (4540) - active from 0s to 30s
	monkID := createHostileGUID(4540)
	characters[monkID] = createTestCharacter(monkID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(30 * time.Second)},
	})

	// Scarlet Chaplain (4299) - active from 10s to 40s (overlaps with monk)
	chaplainID := createHostileGUID(4299)
	characters[chaplainID] = createTestCharacter(chaplainID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime.Add(10 * time.Second), end: baseTime.Add(40 * time.Second)},
	})

	fights := AggregateFights(characters)

	if len(fights) != 1 {
		t.Fatalf("expected 1 fight (overlapping), got %d", len(fights))
	}

	fight := fights[0]
	if len(fight.Hostiles) != 2 {
		t.Fatalf("expected 2 hostiles in fight, got %d", len(fight.Hostiles))
	}

	if fight.Start != baseTime {
		t.Errorf("expected fight start %v, got %v", baseTime, fight.Start)
	}

	expectedEnd := baseTime.Add(40 * time.Second)
	if fight.End != expectedEnd {
		t.Errorf("expected fight end %v, got %v", expectedEnd, fight.End)
	}
}

func TestAggregateFights_SeparateFights(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Scarlet Monk (4540) - active from 0s to 30s
	monkID := createHostileGUID(4540)
	characters[monkID] = createTestCharacter(monkID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(30 * time.Second)},
	})

	// Scarlet Chaplain (4299) - active from 120s to 150s (no overlap, beyond cooldown)
	chaplainID := createHostileGUID(4299)
	characters[chaplainID] = createTestCharacter(chaplainID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime.Add(120 * time.Second), end: baseTime.Add(150 * time.Second)},
	})

	fights := AggregateFights(characters)

	if len(fights) != 2 {
		t.Fatalf("expected 2 separate fights, got %d", len(fights))
	}

	// First fight
	if fights[0].Start != baseTime {
		t.Errorf("expected first fight start %v, got %v", baseTime, fights[0].Start)
	}
	if fights[0].End != baseTime.Add(30*time.Second) {
		t.Errorf("expected first fight end %v, got %v", baseTime.Add(30*time.Second), fights[0].End)
	}
	if len(fights[0].Hostiles) != 1 {
		t.Errorf("expected 1 hostile in first fight, got %d", len(fights[0].Hostiles))
	}

	// Second fight
	if fights[1].Start != baseTime.Add(120*time.Second) {
		t.Errorf("expected second fight start %v, got %v", baseTime.Add(120*time.Second), fights[1].Start)
	}
	if fights[1].End != baseTime.Add(150*time.Second) {
		t.Errorf("expected second fight end %v, got %v", baseTime.Add(150*time.Second), fights[1].End)
	}
	if len(fights[1].Hostiles) != 1 {
		t.Errorf("expected 1 hostile in second fight, got %d", len(fights[1].Hostiles))
	}
}

func TestAggregateFights_MultiplePeriodsPerHostile(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Scarlet Monk with two activity periods in the same fight
	monkID := createHostileGUID(4540)
	characters[monkID] = createTestCharacter(monkID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(10 * time.Second)},
		{start: baseTime.Add(15 * time.Second), end: baseTime.Add(25 * time.Second)},
	})

	fights := AggregateFights(characters)

	if len(fights) != 1 {
		t.Fatalf("expected 1 fight, got %d", len(fights))
	}

	fight := fights[0]
	if len(fight.Hostiles) != 1 {
		t.Fatalf("expected 1 hostile, got %d", len(fight.Hostiles))
	}

	hostile := fight.Hostiles[0]
	if len(hostile.Activity) != 2 {
		t.Fatalf("expected 2 activity periods, got %d", len(hostile.Activity))
	}

	if fight.Start != baseTime {
		t.Errorf("expected fight start %v, got %v", baseTime, fight.Start)
	}

	expectedEnd := baseTime.Add(25 * time.Second)
	if fight.End != expectedEnd {
		t.Errorf("expected fight end %v, got %v", expectedEnd, fight.End)
	}
}

func TestAggregateFights_IgnoreNonHostiles(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Scarlet Monk (4540) - hostile
	monkID := createHostileGUID(4540)
	characters[monkID] = createTestCharacter(monkID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(30 * time.Second)},
	})

	// Some random creature (not in hostile list)
	randomID := createHostileGUID(9999)
	characters[randomID] = createTestCharacter(randomID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(30 * time.Second)},
	})

	fights := AggregateFights(characters)

	if len(fights) != 1 {
		t.Fatalf("expected 1 fight, got %d", len(fights))
	}

	fight := fights[0]
	if len(fight.Hostiles) != 1 {
		t.Fatalf("expected only 1 hostile (non-hostile should be filtered), got %d", len(fight.Hostiles))
	}
}

func TestAggregateFights_IgnoreActivePeriodsWithoutEnd(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Scarlet Monk with one completed period and one ongoing period
	monkID := createHostileGUID(4540)
	char := encounters.NewCharacter(monkID, baseTime)
	
	// Completed period
	char.Activity.Periods = append(char.Activity.Periods, encounters.Active{
		Start: &encounters.ExplainedTimestamp{
			Timestamp:   messages.TimedOut(baseTime),
			Explanation: "test",
		},
		End: &encounters.ExplainedTimestamp{
			Timestamp:   messages.TimedOut(baseTime.Add(30 * time.Second)),
			Explanation: "test",
		},
	})
	
	// Ongoing period (no end)
	char.Activity.Periods = append(char.Activity.Periods, encounters.Active{
		Start: &encounters.ExplainedTimestamp{
			Timestamp:   messages.TimedOut(baseTime.Add(60 * time.Second)),
			Explanation: "test",
		},
		End: nil,
	})
	
	characters[monkID] = char

	fights := AggregateFights(characters)

	if len(fights) != 1 {
		t.Fatalf("expected 1 fight, got %d", len(fights))
	}

	fight := fights[0]
	if len(fight.Hostiles[0].Activity) != 1 {
		t.Errorf("expected only completed period to be included, got %d periods", len(fight.Hostiles[0].Activity))
	}
}

func TestAggregateFights_EmptyCharacters(t *testing.T) {
	characters := encounters.NewCharacters()
	fights := AggregateFights(characters)

	if fights != nil {
		t.Errorf("expected nil for empty characters, got %d fights", len(fights))
	}
}

func TestAggregateFights_ComplexScenario(t *testing.T) {
	baseTime := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)

	characters := encounters.NewCharacters()
	
	// Fight 1: Trash pull (0-30s)
	monk1ID := createHostileGUID(4540)
	characters[monk1ID] = createTestCharacter(monk1ID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime, end: baseTime.Add(30 * time.Second)},
	})

	chaplain1ID := createHostileGUID(4299)
	characters[chaplain1ID] = createTestCharacter(chaplain1ID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime.Add(5 * time.Second), end: baseTime.Add(25 * time.Second)},
	})

	// Fight 2: Boss fight (120-300s)
	mograineID := createHostileGUID(3976) // Scarlet Commander Mograine
	characters[mograineID] = createTestCharacter(mograineID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime.Add(120 * time.Second), end: baseTime.Add(200 * time.Second)},
	})

	whitemaneID := createHostileGUID(3977) // High Inquisitor Whitemane
	characters[whitemaneID] = createTestCharacter(whitemaneID, []struct {
		start time.Time
		end   time.Time
	}{
		{start: baseTime.Add(180 * time.Second), end: baseTime.Add(300 * time.Second)},
	})

	fights := AggregateFights(characters)

	if len(fights) != 2 {
		t.Fatalf("expected 2 fights, got %d", len(fights))
	}

	// Verify fight 1
	if len(fights[0].Hostiles) != 2 {
		t.Errorf("expected 2 hostiles in fight 1, got %d", len(fights[0].Hostiles))
	}
	if fights[0].Start != baseTime {
		t.Errorf("fight 1 start incorrect: %v", fights[0].Start)
	}
	if fights[0].End != baseTime.Add(30*time.Second) {
		t.Errorf("fight 1 end incorrect: %v", fights[0].End)
	}

	// Verify fight 2
	if len(fights[1].Hostiles) != 2 {
		t.Errorf("expected 2 hostiles in fight 2, got %d", len(fights[1].Hostiles))
	}
	if fights[1].Start != baseTime.Add(120*time.Second) {
		t.Errorf("fight 2 start incorrect: %v", fights[1].Start)
	}
	if fights[1].End != baseTime.Add(300*time.Second) {
		t.Errorf("fight 2 end incorrect: %v", fights[1].End)
	}
}
