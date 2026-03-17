package combat

import "github.com/Emyrk/chronicle/simulation/gamedata"

// Aura represents an active buff/debuff on a unit.
type Aura struct {
	SpellID       int32
	CasterLevel   int32
	Effects       [3]AuraEffect
	MaxDurationMs int32
	RemainingMs   int32
	StackCount    int32
	MaxStacks     int32
	ProcCharges   int32
	Permanent     bool
}

// AuraEffect represents a single effect within an aura.
type AuraEffect struct {
	Type       int32   // AuraType constant
	Amount     float64 // snapshotted value (damage per tick, stat bonus, etc.)
	MiscValue  int32   // school mask, stat type, etc.
	PeriodicMs int32   // tick interval (0 = non-periodic)
	NextTickMs int32   // ms until next tick
	Active     bool
}

// AuraTickEvent describes a periodic tick that occurred.
type AuraTickEvent struct {
	SpellID   int32
	EffectIdx int
	Amount    float64
	AuraType  int32
}

// AuraTracker manages active auras on a unit.
type AuraTracker struct {
	auras []*Aura
}

// NewAuraTracker creates an empty tracker.
func NewAuraTracker() *AuraTracker {
	return &AuraTracker{}
}

// AddAura adds or refreshes an aura. If an aura with the same SpellID
// already exists, it refreshes duration and adds a stack (up to MaxStacks).
func (t *AuraTracker) AddAura(a *Aura) {
	for _, existing := range t.auras {
		if existing.SpellID == a.SpellID {
			// Refresh duration
			existing.RemainingMs = a.MaxDurationMs
			if existing.MaxStacks > 0 && existing.StackCount < existing.MaxStacks {
				existing.StackCount++
			}
			// Update snapshotted amounts
			for i := range a.Effects {
				if a.Effects[i].Active {
					existing.Effects[i] = a.Effects[i]
				}
			}
			return
		}
	}
	if a.StackCount == 0 {
		a.StackCount = 1
	}
	t.auras = append(t.auras, a)
}

// RemoveAura removes the first aura matching spellID.
func (t *AuraTracker) RemoveAura(spellID int32) {
	for i, a := range t.auras {
		if a.SpellID == spellID {
			t.auras = append(t.auras[:i], t.auras[i+1:]...)
			return
		}
	}
}

// GetAura returns the aura for a spell, or nil.
func (t *AuraTracker) GetAura(spellID int32) *Aura {
	for _, a := range t.auras {
		if a.SpellID == spellID {
			return a
		}
	}
	return nil
}

// HasAura returns true if an aura with the given spellID is active.
func (t *AuraTracker) HasAura(spellID int32) bool {
	return t.GetAura(spellID) != nil
}

// ActiveAuras returns all active auras.
func (t *AuraTracker) ActiveAuras() []*Aura {
	return t.auras
}

// GetTotalModifier sums flat modifiers of a given aura type matching the school mask.
func (t *AuraTracker) GetTotalModifier(auraType int32, schoolMask int32) float64 {
	var total float64
	for _, a := range t.auras {
		for _, eff := range a.Effects {
			if !eff.Active || eff.Type != auraType {
				continue
			}
			if schoolMask == 0 || eff.MiscValue == 0 || (eff.MiscValue&schoolMask) != 0 {
				total += eff.Amount * float64(a.StackCount)
			}
		}
	}
	return total
}

// GetTotalModifierPercent returns the multiplicative product of percent mods
// of a given aura type matching the school mask.
func (t *AuraTracker) GetTotalModifierPercent(auraType int32, schoolMask int32) float64 {
	product := 1.0
	for _, a := range t.auras {
		for _, eff := range a.Effects {
			if !eff.Active || eff.Type != auraType {
				continue
			}
			if schoolMask == 0 || eff.MiscValue == 0 || (eff.MiscValue&schoolMask) != 0 {
				for s := int32(0); s < a.StackCount; s++ {
					product *= 1.0 + eff.Amount/100.0
				}
			}
		}
	}
	return product
}

// TickAuras advances all periodic effects by deltaMs, returning tick events.
func (t *AuraTracker) TickAuras(deltaMs int32) []AuraTickEvent {
	var events []AuraTickEvent
	for _, a := range t.auras {
		for i := range a.Effects {
			eff := &a.Effects[i]
			if !eff.Active || eff.PeriodicMs <= 0 {
				continue
			}
			eff.NextTickMs -= deltaMs
			for eff.NextTickMs <= 0 {
				events = append(events, AuraTickEvent{
					SpellID:   a.SpellID,
					EffectIdx: i,
					Amount:    eff.Amount * float64(a.StackCount),
					AuraType:  eff.Type,
				})
				eff.NextTickMs += eff.PeriodicMs
			}
		}
	}
	return events
}

// ExpireAuras decrements remaining duration by deltaMs and removes expired auras.
// Returns the spell IDs of expired auras.
func (t *AuraTracker) ExpireAuras(deltaMs int32) []int32 {
	var expired []int32
	remaining := t.auras[:0]
	for _, a := range t.auras {
		if a.Permanent {
			remaining = append(remaining, a)
			continue
		}
		a.RemainingMs -= deltaMs
		if a.RemainingMs <= 0 {
			expired = append(expired, a.SpellID)
		} else {
			remaining = append(remaining, a)
		}
	}
	t.auras = remaining
	return expired
}

// CreateAuraFromSpell creates an Aura from spell data, snapshotting periodic damage.
func CreateAuraFromSpell(spell *gamedata.SpellData, casterLevel int32, spellPower int32) *Aura {
	a := &Aura{
		SpellID:       spell.ID,
		CasterLevel:   casterLevel,
		MaxDurationMs: spell.DurationMs,
		RemainingMs:   spell.DurationMs,
		StackCount:    1,
	}
	for i := range spell.Effects {
		eff := &spell.Effects[i]
		if eff.Type == gamedata.SpellEffectNone {
			continue
		}
		if eff.Type == gamedata.SpellEffectApplyAura {
			ae := AuraEffect{
				Type:       eff.AuraType,
				Amount:     float64(eff.BasePoints + 1), // +1 for base dice
				MiscValue:  eff.MiscValue,
				PeriodicMs: eff.AuraPeriodMs,
				Active:     true,
			}
			if eff.AuraPeriodMs > 0 {
				ae.NextTickMs = eff.AuraPeriodMs
			}
			// Snapshot periodic damage with spell power
			if eff.AuraType == gamedata.AuraPeriodicDamage {
				coeff := float64(eff.BonusCoefficient)
				if coeff < 0 {
					// Default DoT coefficient
					numTicks := int32(0)
					if eff.AuraPeriodMs > 0 && spell.DurationMs > 0 {
						numTicks = spell.DurationMs / eff.AuraPeriodMs
					}
					coeff = DefaultSpellCoefficient(spell.CastTimeMs, spell.DurationMs, true, false, numTicks)
				}
				ae.Amount += float64(spellPower) * coeff * LevelPenalty(spell.SpellLevel)
			}
			a.Effects[i] = ae
		}
	}
	return a
}
