package simulation

import (
	"testing"

	"github.com/Emyrk/chronicle/simulation/combat"
	"github.com/Emyrk/chronicle/simulation/gamedata"
	"github.com/Emyrk/chronicle/simulation/gamedata/jsonprovider"
)

func makeTestProvider() *jsonprovider.Provider {
	p := jsonprovider.New()

	// Frostbolt Rank 11
	p.AddSpell(gamedata.SpellData{
		ID:         25304,
		Name:       "Frostbolt",
		School:     gamedata.SchoolMaskFrost,
		DmgClass:   gamedata.SpellDmgClassMagic,
		PowerType:  gamedata.PowerMana,
		ManaCost:   290,
		CastTimeMs: 2500,
		GCDMs:      1500,
		SpellLevel: 60,
		Effects: [3]gamedata.SpellEffect{
			{
				Type:             gamedata.SpellEffectSchoolDamage,
				BasePoints:       515,
				DieSides:         41,
				BaseDice:         1,
				BonusCoefficient: 0.814,
			},
		},
	})

	// Fire Blast Rank 7 (instant)
	p.AddSpell(gamedata.SpellData{
		ID:         10199,
		Name:       "Fire Blast",
		School:     gamedata.SchoolMaskFire,
		DmgClass:   gamedata.SpellDmgClassMagic,
		PowerType:  gamedata.PowerMana,
		ManaCost:   340,
		CastTimeMs: 0,
		CooldownMs: 8000,
		GCDMs:      1500,
		SpellLevel: 56,
		Effects: [3]gamedata.SpellEffect{
			{
				Type:             gamedata.SpellEffectSchoolDamage,
				BasePoints:       431,
				DieSides:         48,
				BaseDice:         1,
				BonusCoefficient: 0.429,
			},
		},
	})

	// Corruption (DoT)
	p.AddSpell(gamedata.SpellData{
		ID:         25311,
		Name:       "Corruption",
		School:     gamedata.SchoolMaskShadow,
		DmgClass:   gamedata.SpellDmgClassMagic,
		PowerType:  gamedata.PowerMana,
		ManaCost:   370,
		CastTimeMs: 2000,
		GCDMs:      1500,
		DurationMs: 18000,
		SpellLevel: 58,
		Effects: [3]gamedata.SpellEffect{
			{
				Type:             gamedata.SpellEffectApplyAura,
				AuraType:         gamedata.AuraPeriodicDamage,
				BasePoints:       136,
				AuraPeriodMs:     3000,
				BonusCoefficient: 0.167,
			},
		},
	})

	p.SetPlayerBaseStats(1, 8, 60, gamedata.PlayerBaseStats{
		Health: 3000, Mana: 4000, Strength: 30, Agility: 30,
		Stamina: 50, Intellect: 120, Spirit: 100,
	})

	return p
}

func makeBoss() gamedata.CreatureData {
	return gamedata.CreatureData{
		EntryID:           99999,
		Name:              "Test Boss",
		Level:             63,
		Health:            1000000,
		Armor:             3731,
		CreatureType:      gamedata.CreatureTypeHumanoid,
		Rank:              gamedata.CreatureRankWorldBoss,
		MeleeAttackTimeMs: 2000,
	}
}

func TestEngineSpellCast(t *testing.T) {
	t.Parallel()
	provider := makeTestProvider()
	boss := makeBoss()

	config := CharacterConfig{
		Race:  1, // human
		Class: 8, // mage
		Level: 60,
	}

	engine := NewEngine(config, boss, provider)
	engine.SetSeed(42)
	engine.Reset()

	// Manually set spell power for testing
	engine.state.Caster.SpellPower[0] = 300
	engine.state.Caster.SpellHit = 16 // cap hit
	engine.state.Caster.Power = 10000
	engine.state.Caster.MaxPower = 10000

	err := engine.CastSpell(25304) // Frostbolt
	if err != nil {
		t.Fatalf("CastSpell failed: %v", err)
	}

	// Step through events until CastComplete
	var castComplete *StepResult
	for i := 0; i < 20; i++ {
		r, ok := engine.Step()
		if !ok {
			break
		}
		if r.Event == EventCastComplete && r.SpellID == 25304 {
			castComplete = &r
			break
		}
	}

	if castComplete == nil {
		t.Fatal("never got CastComplete event for Frostbolt")
	}

	if castComplete.TimeMs != 2500 {
		t.Errorf("CastComplete at %dms, want 2500ms", castComplete.TimeMs)
	}

	// With 300 SP and 0.814 coeff: base ~516-556 + 244 = ~760-800
	if castComplete.Outcome != combat.OutcomeResist {
		if castComplete.Amount < 500 || castComplete.Amount > 1500 {
			t.Errorf("damage %d outside expected range [500, 1500]", castComplete.Amount)
		}
	}
}

func TestEngineInstantCast(t *testing.T) {
	t.Parallel()
	provider := makeTestProvider()
	boss := makeBoss()

	config := CharacterConfig{Race: 1, Class: 8, Level: 60}
	engine := NewEngine(config, boss, provider)
	engine.SetSeed(42)
	engine.Reset()
	engine.state.Caster.SpellPower[0] = 300
	engine.state.Caster.SpellHit = 16
	engine.state.Caster.Power = 10000
	engine.state.Caster.MaxPower = 10000

	err := engine.CastSpell(10199) // Fire Blast (instant)
	if err != nil {
		t.Fatalf("CastSpell failed: %v", err)
	}

	// Step through until we get CastComplete
	var gotComplete bool
	for i := 0; i < 20; i++ {
		r, ok := engine.Step()
		if !ok {
			break
		}
		if r.Event == EventCastComplete && r.SpellID == 10199 {
			gotComplete = true
			if r.TimeMs != 0 {
				t.Errorf("instant cast at %dms, want 0ms", r.TimeMs)
			}
			break
		}
	}
	if !gotComplete {
		t.Fatal("never got CastComplete for Fire Blast")
	}

	// Fire Blast should be on cooldown
	ready, remaining := engine.IsSpellReady(10199)
	if ready {
		t.Error("Fire Blast should be on cooldown")
	}
	if remaining != 8000 {
		t.Errorf("cooldown remaining %d, want 8000", remaining)
	}
}

func TestEngineAutoAttack(t *testing.T) {
	t.Parallel()
	provider := makeTestProvider()
	boss := makeBoss()

	config := CharacterConfig{Race: 1, Class: 1, Level: 60} // warrior
	engine := NewEngine(config, boss, provider)
	engine.SetSeed(42)
	engine.Reset()

	// Set up melee stats
	engine.state.Caster.MHDmgMin = 100
	engine.state.Caster.MHDmgMax = 200
	engine.state.Caster.MHSpeedMs = 2600
	engine.state.Caster.AttackPower = 1500
	engine.state.Caster.HitChance = 9 // hit capped
	engine.state.Caster.CritChance = 25
	engine.state.Caster.WeaponSkill = 300

	engine.StartAutoAttack()

	// Run for 10 seconds
	var autoAttacks int
	for {
		next, ok := engine.events.peek()
		if !ok || next.TimeMs > 10000 {
			break
		}
		r, ok := engine.Step()
		if !ok {
			break
		}
		if r.Event == EventAutoAttack {
			autoAttacks++
		}
	}

	// With 2600ms speed, expect 4-5 auto attacks in 10 seconds
	if autoAttacks < 3 || autoAttacks > 6 {
		t.Errorf("got %d auto attacks in 10s, expected 3-6", autoAttacks)
	}

	if engine.State().TotalDamage <= 0 {
		t.Error("expected some damage dealt")
	}
}

func TestEngineRun(t *testing.T) {
	t.Parallel()
	provider := makeTestProvider()
	boss := makeBoss()

	config := CharacterConfig{Race: 1, Class: 8, Level: 60}
	engine := NewEngine(config, boss, provider)
	engine.SetSeed(42)

	// Simple rotation: just cast Frostbolt repeatedly
	engine.SetRotation(&simpleRotation{spellID: 25304})

	// Override stats
	engine.Reset()
	engine.state.Caster.SpellPower[0] = 300
	engine.state.Caster.SpellHit = 16
	engine.state.Caster.Power = 100000
	engine.state.Caster.MaxPower = 100000

	results := engine.Run(60000) // 60 seconds

	if results.DPS <= 0 {
		t.Error("expected positive DPS")
	}
	if results.TotalDamage <= 0 {
		t.Error("expected positive total damage")
	}
	t.Logf("60s sim: DPS=%.1f, TotalDmg=%d", results.DPS, results.TotalDamage)

	// Check spell breakdown
	fb, ok := results.SpellBreakdown[25304]
	if !ok {
		t.Error("expected Frostbolt in breakdown")
	} else {
		t.Logf("Frostbolt: casts=%d, hits=%d, crits=%d, misses=%d, totalDmg=%d",
			fb.Casts, fb.Hits, fb.Crits, fb.Misses, fb.TotalDmg)
		if fb.Casts < 10 {
			t.Errorf("expected at least 10 Frostbolt casts in 60s, got %d", fb.Casts)
		}
	}
}

func TestEngineResourceDeduction(t *testing.T) {
	t.Parallel()
	provider := makeTestProvider()
	boss := makeBoss()

	config := CharacterConfig{Race: 1, Class: 8, Level: 60}
	engine := NewEngine(config, boss, provider)
	engine.SetSeed(42)
	engine.Reset()
	engine.state.Caster.Power = 500
	engine.state.Caster.MaxPower = 10000

	// Frostbolt costs 290 mana
	err := engine.CastSpell(25304)
	if err != nil {
		t.Fatalf("CastSpell failed: %v", err)
	}
	if engine.state.Caster.Power != 210 {
		t.Errorf("mana after cast = %d, want 210", engine.state.Caster.Power)
	}

	// Step through to complete the cast + GCD
	for i := 0; i < 20; i++ {
		r, ok := engine.Step()
		if !ok {
			break
		}
		if r.Event == EventGCDReady && r.TimeMs >= 2500 {
			break
		}
	}

	// Try to cast again — should fail (need 290, have ~210 + regen)
	// Set mana low enough to guarantee failure
	engine.state.Caster.Power = 100
	err = engine.CastSpell(25304)
	if err == nil {
		t.Error("expected error for insufficient mana")
	}
}

// simpleRotation just casts one spell repeatedly.
type simpleRotation struct {
	spellID int32
}

func (r *simpleRotation) NextAction(state *SimState) *Action {
	return &Action{Type: ActionCastSpell, SpellID: r.spellID}
}
