package synthetic

import (
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// absorption is a synthetic event generator that attributes absorbed damage
// to the specific absorb buff (e.g. Power Word: Shield) that absorbed it.
//
// Vanilla 1.12 combat logs report absorbs without attribution: partial absorbs
// appear as trailers "(N absorbed)" on damage lines, and full absorbs appear
// as amount-less lines. This generator tracks active absorb auras and emits
// synthetic messages.Absorbed events attributed to the most likely shield.
//
// Shield detection uses AuraCast events (CC v2 addon): server-side aura
// applications emitted for all raid members regardless of client visibility.
// BUFF_ADD/BUFF_REM events are client-side and unreliable for distant players,
// so they are not used.
//
// Shield expiry uses AuraCast.DurationMS. When a shield's duration has elapsed
// since application, it is removed from tracking on the next damage check.
//
// Attribution algorithm:
//  1. Identify absorb buffs via AuraCast.EffectAuraName == AuraEffectSchoolAbsorb.
//  2. Track active shields per target GUID with duration-based expiry.
//  3. On damage with absorb trailer, pick the best matching shield
//     (school-specific > all-school, most-recently-applied tiebreak).
//  4. Emit synthetic Absorbed event immediately after the triggering Damage.
type absorption struct {
	logger *slog.Logger

	// activeShields tracks shields per target GUID.
	activeShields map[guid.GUID][]*activeShield
}

type activeShield struct {
	spell        *chrondbc.Spell
	spellName    string
	appliedAt    time.Time
	durationMS   int32        // from AuraCast; 0 means no expiry known
	caster       guid.GUID    // zero if unknown
	estRemaining int32        // estimated remaining capacity (soft bound)
	schoolMask   types.School
	exhausted    bool         // deprioritized when capacity likely gone
}

func newAbsorption(logger *slog.Logger) *absorption {
	return &absorption{
		logger:        logger,
		activeShields: make(map[guid.GUID][]*activeShield),
	}
}

func (a *absorption) ProcessMessages(msgs []messages.Message) []messages.Message {
	var result []messages.Message

	for _, msg := range msgs {
		result = append(result, msg)

		switch m := msg.(type) {
		case *messages.AuraCast:
			a.processAuraCast(m)
		case *messages.Damage:
			if synth := a.processDamage(m); synth != nil {
				result = append(result, synth)
			}
		}
	}

	return result
}

// processAuraCast handles the CC v2 addon's AURA_CAST events. These are
// server-side aura applications emitted for all raid members regardless of
// client visibility. Each AURA_CAST carries a single effect; a spell with
// multiple effects (e.g. PW:S with absorb + Weakened Soul) produces multiple
// AURA_CAST events — we only care about the one with AuraEffectSchoolAbsorb.
func (a *absorption) processAuraCast(ac *messages.AuraCast) {
	if ac.EffectAuraName != chrondbc.AuraEffectSchoolAbsorb {
		return
	}
	if ac.Target == nil {
		return
	}

	target := *ac.Target
	spellName := ""
	if ac.Spell != nil {
		spellName = ac.Spell.Name()
	}

	shield := &activeShield{
		spell:      ac.Spell,
		spellName:  spellName,
		appliedAt:  ac.Date(),
		durationMS: ac.DurationMS,
		caster:     ac.Caster,
		schoolMask: types.School(ac.EffectMiscValue),
	}

	// Extract absorb capacity from spell data if available.
	if ac.Spell != nil {
		for i, ae := range ac.Spell.EffectAura {
			if ae == chrondbc.AuraEffectSchoolAbsorb {
				base := ac.Spell.EffectBasePoints[i]
				dice := ac.Spell.EffectDieSides[i]
				// Use 2x capacity as a soft upper bound to account for
				// talents (Improved PW:S), spell power scaling, and
				// private server customizations.
				shield.estRemaining = (base + dice) * 2
				break
			}
		}
	}

	a.activeShields[target] = append(a.activeShields[target], shield)
}

// expireShields removes shields whose duration has elapsed at the given time.
func (a *absorption) expireShields(target guid.GUID, now time.Time) {
	shields := a.activeShields[target]
	if len(shields) == 0 {
		return
	}

	n := 0
	for _, s := range shields {
		if s.durationMS > 0 {
			expiry := s.appliedAt.Add(time.Duration(s.durationMS) * time.Millisecond)
			if now.After(expiry) {
				continue // expired, drop it
			}
		}
		shields[n] = s
		n++
	}
	// Clear trailing references to avoid leaking pointers.
	for i := n; i < len(shields); i++ {
		shields[i] = nil
	}
	a.activeShields[target] = shields[:n]
}

func (a *absorption) processDamage(dmg *messages.Damage) *messages.Absorbed {
	// Always check trailers for absorbed amounts — the parent HitType flag
	// is not always set even when the trailer carries an absorb entry.
	absorbAmount := trailerAbsorbAmount(dmg.Trailer)
	if absorbAmount <= 0 {
		return nil
	}

	// Expire shields whose duration has elapsed before matching.
	a.expireShields(dmg.Target, dmg.Date())

	shields := a.activeShields[dmg.Target]
	if len(shields) == 0 {
		return nil
	}

	best := pickShield(shields, dmg.School)
	if best == nil {
		return nil
	}

	// Decrement estimated remaining capacity.
	if best.estRemaining > 0 {
		best.estRemaining -= absorbAmount
		if best.estRemaining <= 0 {
			best.exhausted = true
		}
	}

	absorbed := &messages.Absorbed{
		MessageBase:  messages.Base(dmg.Date(), messages.WithSynthetic()),
		Attacker:     derefGUID(dmg.Caster),
		Target:       dmg.Target,
		DamageSpell:  dmg.SpellData,
		Caster:       best.caster,
		AbsorbSpell:  best.spell,
		AbsorbSchool: best.schoolMask,
		Amount:       absorbAmount,
	}

	return absorbed
}

// pickShield selects the best shield to credit for absorbing damage of the
// given school. Preference order:
//  1. Non-exhausted school-specific shields matching damage school (most recent first)
//  2. Non-exhausted all-school shields (most recent first)
//  3. Exhausted shields (same ordering) — they may have had more capacity than estimated
func pickShield(shields []*activeShield, damageSchool types.School) *activeShield {
	var bestSpecific, bestGeneral, bestExhausted *activeShield

	for _, s := range shields {
		if !schoolMatches(s.schoolMask, damageSchool) {
			continue
		}

		isSpecific := s.schoolMask != 0 && !isAllSchools(s.schoolMask)

		if s.exhausted {
			if bestExhausted == nil || s.appliedAt.After(bestExhausted.appliedAt) {
				bestExhausted = s
			}
			continue
		}

		if isSpecific {
			if bestSpecific == nil || s.appliedAt.After(bestSpecific.appliedAt) {
				bestSpecific = s
			}
		} else {
			if bestGeneral == nil || s.appliedAt.After(bestGeneral.appliedAt) {
				bestGeneral = s
			}
		}
	}

	if bestSpecific != nil {
		return bestSpecific
	}
	if bestGeneral != nil {
		return bestGeneral
	}
	return bestExhausted
}

// schoolMatches returns true if the shield's school mask covers the damage school.
// A zero school mask means the shield absorbs all schools (e.g. Power Word: Shield).
func schoolMatches(shieldMask, damageSchool types.School) bool {
	if shieldMask == 0 {
		return true
	}
	return shieldMask.Has(damageSchool)
}

// isAllSchools returns true if the mask covers all damage schools (physical through arcane).
func isAllSchools(mask types.School) bool {
	const allSchools = types.PhysicalSchool | types.HolySchool | types.FireSchool |
		types.NatureSchool | types.FrostSchool | types.ShadowSchool | types.ArcaneSchool
	return mask&allSchools == allSchools
}

// trailerAbsorbAmount extracts the absorbed amount from a damage trailer.
func trailerAbsorbAmount(trailer types.Trailer) int32 {
	for _, entry := range trailer {
		if entry.HitType.Has(types.HitTypePartialAbsorb) || entry.HitType.Has(types.HitTypeFullAbsorb) {
			if entry.Amount != nil {
				return int32(*entry.Amount)
			}
		}
	}
	return 0
}

func derefGUID(g *guid.GUID) guid.GUID {
	if g == nil {
		return 0
	}
	return *g
}
