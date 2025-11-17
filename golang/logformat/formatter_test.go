package logformat

import (
	"regexp"
	"strings"
	"testing"
)

func TestNewFormatter(t *testing.T) {
	f := NewFormatter("testplayer")
	if f.playerName != "Testplayer" {
		t.Errorf("Expected playerName to be 'Testplayer', got '%s'", f.playerName)
	}
}

func TestYouReplacements(t *testing.T) {
	f := NewFormatter("Hunter")

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "You hit",
			input:    "  You hit Target for 100.",
			expected: "  Hunter hits Target for 100.",
		},
		{
			name:     "You crit",
			input:    "  You crit Boss for 500 damage.",
			expected: "  Hunter crits Boss for 500 damage.",
		},
		{
			name:     "You gain",
			input:    "  You gain 50 mana.",
			expected: "  Hunter gains 50 mana.",
		},
		{
			name:     "Your spell",
			input:    "  Your Fireball hits Enemy for 300.",
			expected: "  Hunter 's Fireball hits Enemy for 300.",
		},
		{
			name:     "You die",
			input:    "  You die.",
			expected: "  Hunter dies.",
		},
		{
			name:     "You have slain",
			input:    "  You have slain Dragon!",
			expected: "  Dragon is slain by Hunter.",
		},
		{
			name:     "hits you for",
			input:    "  Boss hits you for 200 damage.",
			expected: "  Boss hits Hunter for 200 damage.",
		},
		{
			name:     "causes you",
			input:    "  Ability causes you to take damage.",
			expected: "  Ability causes Hunter to take damage.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := handleReplacements(tt.input, f.youReplacements)
			if result != tt.expected {
				t.Errorf("Expected:\n%s\nGot:\n%s", tt.expected, result)
			}
		})
	}
}

func TestPetReplacements(t *testing.T) {
	f := NewFormatter("Hunter")

	input := "  Wolf (Hunter) hits Target for 50."

	result := handleReplacements(input, f.petReplacements)
	if !strings.Contains(result, "Hunter") || !strings.Contains(result, "pet") {
		t.Errorf("Expected pet replacement, got: %s", result)
	}
}

func TestMobNamesWithApostrophe(t *testing.T) {
	f := NewFormatter("Player")

	tests := []struct {
		input    string
		expected string
	}{
		{
			input:    "  Onyxia's Elite Guard hits Player for 100.",
			expected: "  Onyxias Elite Guard hits Player for 100.",
		},
		{
			input:    "  Sartura's Royal Guard attacks.",
			expected: "  Sarturas Royal Guard attacks.",
		},
	}

	for _, tt := range tests {
		result := handleSimpleReplacements(tt.input, f.mobNamesWithApostrophe)
		if result != tt.expected {
			t.Errorf("Expected:\n%s\nGot:\n%s", tt.expected, result)
		}
	}
}

func TestGenericReplacements(t *testing.T) {
	f := NewFormatter("Player")

	input := "  Warrior's Charge hits Target."
	// Should add space before 's
	result := handleReplacements(input, f.genericReplacements)
	
	// The generic replacement should split "Warrior's" to "Warrior 's"
	if !strings.Contains(result, " 's ") {
		t.Errorf("Expected space before 's, got: %s", result)
	}
}

func TestProcessLine(t *testing.T) {
	f := NewFormatter("Mage")

	tests := []struct {
		name     string
		input    string
		contains []string
	}{
		{
			name:     "Simple you replacement",
			input:    "  You cast Fireball.\n",
			contains: []string{"Mage casts"},
		},
		{
			name:     "Mob with apostrophe",
			input:    "  Onyxia's Elite Guard hits you for 100.\n",
			contains: []string{"Onyxia", "Mage for"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := f.processLine(tt.input)
			for _, expected := range tt.contains {
				if !strings.Contains(result, expected) {
					t.Errorf("Expected result to contain '%s', got: %s", expected, result)
				}
			}
		})
	}
}

func TestCombatantInfoParsing(t *testing.T) {
	f := NewFormatter("Hunter")

	tests := []struct {
		name        string
		input       string
		shouldHavePet bool
		petName     string
	}{
		{
			name:        "Pet with different name",
			input:       "4/14 20:51:43.354  COMBATANT_INFO: 14.04.24 20:51:43&Hunter&HUNTER&Dwarf&2&Wolf&more_data",
			shouldHavePet: true,
			petName:     "Wolf",
		},
		{
			name:        "Pet with same name as owner",
			input:       "4/14 20:51:43.354  COMBATANT_INFO: 14.04.24 20:51:43&Hunter&HUNTER&Dwarf&2&Hunter&more_data",
			shouldHavePet: true,
			petName:     "HunterPet",
		},
		{
			name:        "No pet",
			input:       "4/14 20:51:43.354  COMBATANT_INFO: 14.04.24 20:51:43&Mage&MAGE&Human&2&nil&more_data",
			shouldHavePet: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f.petNames = make(map[string]bool)
			f.ownerNames = make(map[string]bool)
			f.petRenames = make(map[string]bool)
			f.petRenameReplacements = make(map[*regexp.Regexp]string)

			line := tt.input
			f.processCombatantInfo(&line)

			if tt.shouldHavePet {
				if !f.petNames[tt.petName] {
					t.Errorf("Expected pet name '%s' to be tracked", tt.petName)
				}
			}
		})
	}
}

func TestFormatLog(t *testing.T) {
	f := NewFormatter("Warrior")

	input := `  You hit Boss for 100.
  Your Charge hits Target.
  Boss hits you for 50.
  You die.
`

	reader := strings.NewReader(input)
	lines, err := f.FormatLog(reader)
	if err != nil {
		t.Fatalf("FormatLog failed: %v", err)
	}

	output := strings.Join(lines, "")

	expectedContents := []string{
		"Warrior hits",
		"Warrior 's Charge",
		"Warrior for 50",
		"Warrior dies",
	}

	for _, expected := range expectedContents {
		if !strings.Contains(output, expected) {
			t.Errorf("Expected output to contain '%s'", expected)
		}
	}

	// Should not contain "You"
	if strings.Contains(output, " You ") {
		t.Errorf("Output should not contain ' You ', got: %s", output)
	}
}

func TestLootReplacements(t *testing.T) {
	f := NewFormatter("Player")

	input := "  LOOT: Item|h|r."

	result := handleReplacements(input, f.lootReplacements)
	if !strings.Contains(result, "x1") {
		t.Errorf("Expected loot replacement to add x1, got: %s", result)
	}
}

func TestGenerateOutputFilename(t *testing.T) {
	tests := []struct {
		input    string
		rename   bool
		expected string
	}{
		{
			input:    "WoWCombatLog.txt",
			rename:   false,
			expected: "WoWCombatLog.formatted.txt",
		},
		{
			input:    "CustomLog.txt",
			rename:   false,
			expected: "CustomLog.formatted.txt",
		},
		{
			input:    "WoWCombatLog.txt",
			rename:   true,
			expected: "TurtLog-", // Will have timestamp suffix
		},
	}

	for _, tt := range tests {
		result := GenerateOutputFilename(tt.input, tt.rename)
		if !strings.HasPrefix(result, tt.expected) && !tt.rename {
			t.Errorf("Expected '%s', got '%s'", tt.expected, result)
		}
		if tt.rename && !strings.HasPrefix(result, "TurtLog-") {
			t.Errorf("Expected filename to start with 'TurtLog-', got '%s'", result)
		}
	}
}
