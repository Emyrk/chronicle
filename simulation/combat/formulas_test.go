package combat

import (
	"math"
	"math/rand"
	"testing"
)

func TestArmorMitigation(t *testing.T) {
	tests := []struct {
		name          string
		armor         int32
		attackerLevel int32
		wantMin       float64
		wantMax       float64
	}{
		{"zero armor", 0, 60, 0, 0},
		{"negative armor", -100, 60, 0, 0},
		{"patchwerk ~3731 armor", 3731, 60, 0.39, 0.42},
		{"very high armor", 50000, 60, 0.74, 0.76}, // capped at 0.75
		{"low level attacker", 3731, 1, 0.70, 0.76},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ArmorMitigation(tt.armor, tt.attackerLevel)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("ArmorMitigation(%d, %d) = %f, want [%f, %f]",
					tt.armor, tt.attackerLevel, got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestSpellHitChance(t *testing.T) {
	tests := []struct {
		name     string
		atkLvl   int32
		vicLvl   int32
		spellHit float64
		pvp      bool
		wantMin  float64
		wantMax  float64
	}{
		{"same level", 60, 60, 0, false, 95.5, 96.5},
		{"+3 boss PvE", 60, 63, 0, false, 82, 84},
		{"+3 boss with 16% hit", 60, 63, 16, false, 98, 99.5},
		{"PvP same level", 60, 60, 0, true, 95.5, 96.5},
		{"+3 PvP", 60, 63, 0, true, 86, 88},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SpellHitChance(tt.atkLvl, tt.vicLvl, tt.spellHit, tt.pvp)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("SpellHitChance(%d, %d, %f, %v) = %f, want [%f, %f]",
					tt.atkLvl, tt.vicLvl, tt.spellHit, tt.pvp, got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestSpellResistChance(t *testing.T) {
	tests := []struct {
		resist int32
		level  int32
		want   float64
	}{
		{0, 60, 0},
		{75, 60, 0.1875},
		{300, 60, 0.75}, // capped
	}
	for _, tt := range tests {
		got := SpellResistChance(tt.resist, tt.level)
		if math.Abs(got-tt.want) > 0.001 {
			t.Errorf("SpellResistChance(%d, %d) = %f, want %f", tt.resist, tt.level, got, tt.want)
		}
	}
}

func TestTurtleGlancingDamage(t *testing.T) {
	tests := []struct {
		skill int32
		want  float64
	}{
		{300, 0.65},
		{301, 0.67},
		{305, 0.75},
		{310, 0.85},
		{315, 0.95},
		{320, 0.95}, // capped
		{290, 0.65}, // below 300
	}
	for _, tt := range tests {
		got := TurtleGlancingDamage(tt.skill)
		if math.Abs(got-tt.want) > 0.001 {
			t.Errorf("TurtleGlancingDamage(%d) = %f, want %f", tt.skill, got, tt.want)
		}
	}
}

func TestTurtleGlancingMissReduction(t *testing.T) {
	tests := []struct {
		skill int32
		want  float64
	}{
		{300, 8.0},
		{305, 7.0},
		{310, 6.0},
		{315, 5.0},
		{320, 5.0}, // capped
	}
	for _, tt := range tests {
		got := TurtleGlancingMissReduction(tt.skill)
		if math.Abs(got-tt.want) > 0.001 {
			t.Errorf("TurtleGlancingMissReduction(%d) = %f, want %f", tt.skill, got, tt.want)
		}
	}
}

func TestDefaultSpellCoefficient(t *testing.T) {
	tests := []struct {
		name     string
		cast     int32
		dur      int32
		dot      bool
		channel  bool
		ticks    int32
		wantMin  float64
		wantMax  float64
	}{
		{"3.5s cast", 3500, 0, false, false, 0, 0.99, 1.01},
		{"2.5s cast", 2500, 0, false, false, 0, 0.71, 0.72},
		{"instant", 0, 0, false, false, 0, -0.01, 0.01},
		{"DoT 15s 5 ticks", 0, 15000, true, false, 5, 0.19, 0.21},
		{"channeled 5 ticks", 0, 15000, true, true, 5, 0.19, 0.21},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DefaultSpellCoefficient(tt.cast, tt.dur, tt.dot, tt.channel, tt.ticks)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("got %f, want [%f, %f]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestLevelPenalty(t *testing.T) {
	tests := []struct {
		level int32
		want  float64
	}{
		{20, 1.0},
		{60, 1.0},
		{0, 1.0},
		{10, 0.625},
		{1, 0.2875},
	}
	for _, tt := range tests {
		got := LevelPenalty(tt.level)
		if math.Abs(got-tt.want) > 0.001 {
			t.Errorf("LevelPenalty(%d) = %f, want %f", tt.level, got, tt.want)
		}
	}
}

func TestMeleeOutcomeDistribution(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	counts := make(map[Outcome]int)
	n := 100000

	for i := 0; i < n; i++ {
		result := RollMeleeOutcome(rng,
			8.0,  // miss
			5.0,  // dodge
			0.0,  // parry (from behind)
			40.0, // glancing
			0.0,  // block
			20.0, // crit
			0.0,  // crushing
			true, false, 300,
		)
		counts[result.Outcome]++
	}

	// Verify rough distribution
	missRate := float64(counts[OutcomeMiss]) / float64(n) * 100
	dodgeRate := float64(counts[OutcomeDodge]) / float64(n) * 100
	glancingRate := float64(counts[OutcomeGlancing]) / float64(n) * 100
	critRate := float64(counts[OutcomeCrit]) / float64(n) * 100
	hitRate := float64(counts[OutcomeHit]) / float64(n) * 100

	if missRate < 6 || missRate > 10 {
		t.Errorf("miss rate %f%% outside expected range [6,10]", missRate)
	}
	if glancingRate < 35 || glancingRate > 45 {
		t.Errorf("glancing rate %f%% outside expected range [35,45]", glancingRate)
	}
	if critRate < 15 || critRate > 25 {
		t.Errorf("crit rate %f%% outside expected range [15,25]", critRate)
	}
	_ = dodgeRate
	_ = hitRate
}
