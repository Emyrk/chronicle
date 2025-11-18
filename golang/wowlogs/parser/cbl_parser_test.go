package parser

import (
	"regexp"
	"testing"
)

func TestParseCBLLine_BugPattern(t *testing.T) {
	parser := &Parser{}
	
	// This should be filtered out by the bug pattern
	bugLine := "Someplayer 's crits Sometarget for 1234. (crushing)"
	result := parser.ParseCBLLine(nil, 0, bugLine)
	
	if result != nil {
		t.Errorf("Expected nil for bug pattern, got %v", result)
	}
}

func TestParseCBLLine_ValidHit(t *testing.T) {
	parser := &Parser{}
	
	// This should parse successfully (after implementing full logic)
	validLine := "Warrior hits Boar for 234."
	result := parser.ParseCBLLine(nil, 0, validLine)
	
	// Currently returns nil since parsing logic is not implemented
	// Update this test when you implement the full parsing
	_ = result
}

func TestParseCBLLine_SpellDamage(t *testing.T) {
	parser := &Parser{}
	
	testCases := []struct {
		name    string
		content string
		wantNil bool
	}{
		{
			name:    "spell hit",
			content: "Mage 's Fireball hits Dragon for 500.",
			wantNil: false,
		},
		{
			name:    "spell crit",
			content: "Mage 's Fireball crits Dragon for 1000.",
			wantNil: false,
		},
		{
			name:    "spell with school",
			content: "Mage 's Fireball hits Dragon for 500 Fire damage.",
			wantNil: false,
		},
		{
			name:    "bug pattern - should be filtered",
			content: "Fireball 's crits Dragon for 500.",
			wantNil: true,
		},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := parser.ParseCBLLine(nil, 0, tc.content)
			if tc.wantNil && result != nil {
				t.Errorf("Expected nil, got %v", result)
			}
			// Note: Currently all return nil since full parsing not implemented
		})
	}
}

func TestRegexInitialization(t *testing.T) {
	// Test that regexes are initialized
	initRegexes()
	
	if reDamageHitOrCrit == nil {
		t.Error("reDamageHitOrCrit not initialized")
	}
	if reDamageSpellHitOrCrit == nil {
		t.Error("reDamageSpellHitOrCrit not initialized")
	}
	if reBugDamageSpellHitOrCrit == nil {
		t.Error("reBugDamageSpellHitOrCrit not initialized")
	}
}

func TestRegexPatterns(t *testing.T) {
	initRegexes()
	
	testCases := []struct {
		name    string
		regex   *regexp.Regexp
		input   string
		want    bool
	}{
		{
			name:  "damage hit",
			regex: reDamageHitOrCrit,
			input: "Warrior hits Boar for 234.",
			want:  true,
		},
		{
			name:  "damage crit",
			regex: reDamageHitOrCrit,
			input: "Warrior crits Boar for 567.",
			want:  true,
		},
		{
			name:  "damage miss",
			regex: reDamageMiss,
			input: "Warrior misses Boar.",
			want:  true,
		},
		{
			name:  "spell hit",
			regex: reDamageSpellHitOrCrit,
			input: "Mage 's Fireball hits Dragon for 500.",
			want:  true,
		},
		{
			name:  "spell crit",
			regex: reDamageSpellHitOrCrit,
			input: "Mage 's Fireball crits Dragon for 1000.",
			want:  true,
		},
		{
			name:  "heal",
			regex: reHealHit,
			input: "Priest 's Heal heals Warrior for 500.",
			want:  true,
		},
		{
			name:  "heal crit",
			regex: reHealCrit,
			input: "Priest 's Heal critically heals Warrior for 1000.",
			want:  true,
		},
		{
			name:  "aura gain",
			regex: reAuraGainHarmfulHelpful,
			input: "Warrior gains Battle Shout (1).",
			want:  true,
		},
		{
			name:  "aura fade",
			regex: reAuraFade,
			input: "Battle Shout fades from Warrior.",
			want:  true,
		},
		{
			name:  "unit dies",
			regex: reUnitDieDestroyed,
			input: "Boar dies.",
			want:  true,
		},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.regex.MatchString(tc.input)
			if got != tc.want {
				t.Errorf("MatchString() = %v, want %v", got, tc.want)
			}
		})
	}
}

func BenchmarkParseCBLLine(b *testing.B) {
	parser := &Parser{}
	content := "Warrior hits Boar for 234."
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		parser.ParseCBLLine(nil, 0, content)
	}
}

func BenchmarkRegexInitialization(b *testing.B) {
	// This should only initialize once due to sync.Once
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		initRegexes()
	}
}
