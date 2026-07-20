package synthetic

import (
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// Absorption is a synthetic event generator that attributes absorbed damage
// to the specific absorb buff (e.g. Power Word: Shield) that absorbed it.
// It is shared by the vanilla (1.12 CC v2 addon) and WotLK (3.3.5a client-side)
// parser pipelines.
//
// Client-side combat logs report absorbs without attribution: partial absorbs
// appear as trailers "(N absorbed)" on damage lines, and full absorbs appear
// as amount-less lines. This generator tracks active absorb auras and emits
// synthetic messages.Absorbed events attributed to the most likely shield.
//
// Shield detection uses AuraCast events:
//   - Vanilla CC v2 addon: AURA_CAST carries EffectAuraName, EffectMiscValue
//     (school mask), and DurationMS directly. Emitted server-side for all raid
//     members regardless of client visibility. BUFF_ADD/BUFF_REM are client-side
//     and unreliable for distant players, so they are not used for application.
//   - WotLK CLEU: SPELL_AURA_APPLIED produces AuraCast with only Spell/Caster/
//     Target populated. The absorb effect, school mask, and duration are
//     backfilled from DBC spell data.
//
// Shield removal:
//   - Duration expiry (AuraCast.DurationMS or DBC duration fallback), checked
//     lazily on each damage event.
//   - Aura fade events (AuraStateRemoved). Reliable in WotLK CLEU; in vanilla
//     these are client-side BUFF_REM and only help when visible.
//
// Attribution algorithm:
//  1. Identify absorb buffs via AuraCast.EffectAuraName == AuraEffectSchoolAbsorb,
//     or via DBC spell effects when EffectAuraName is not populated.
//  2. Track active shields per target GUID with duration-based expiry.
//  3. On damage with absorb trailer, pick the best matching shield
//     (school-specific > all-school, most-recently-applied tiebreak).
//  4. Emit synthetic Absorbed event immediately after the triggering Damage.
type Absorption struct {
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

func NewAbsorption(logger *slog.Logger) *Absorption {
	return &Absorption{
		logger:        logger,
		activeShields: make(map[guid.GUID][]*activeShield),
	}
}

func (a *Absorption) ProcessMessages(msgs []messages.Message) []messages.Message {
	var result []messages.Message

	for _, msg := range msgs {
		result = append(result, msg)

		switch m := msg.(type) {
		case *messages.AuraCast:
			a.processAuraCast(m)
		case *messages.Aura:
			a.processAuraFade(m)
		case *messages.Damage:
			if synth := a.processDamage(m); synth != nil {
				result = append(result, synth)
			}
		}
	}

	return result
}

// processAuraCast handles aura application events.
//
// Vanilla CC v2 addon: each AURA_CAST carries a single effect with
// EffectAuraName populated; a spell with multiple effects (e.g. PW:S with
// absorb + Weakened Soul) produces multiple AURA_CAST events — we only care
// about the one with AuraEffectSchoolAbsorb.
//
// WotLK CLEU: SPELL_AURA_APPLIED produces one AuraCast per application with
// EffectAuraName unset (zero). We fall back to scanning the DBC spell effects
// to detect absorb buffs and derive the school mask + duration.
func (a *Absorption) processAuraCast(ac *messages.AuraCast) {
	if ac.Target == nil {
		return
	}

	// absorbEffect is the effect index carrying AuraEffectSchoolAbsorb, or -1.
	absorbEffect := -1
	if ac.Spell != nil {
		for i, ae := range ac.Spell.EffectAura {
			if ae == chrondbc.AuraEffectSchoolAbsorb {
				absorbEffect = i
				break
			}
		}
	}

	explicit := ac.EffectAuraName == chrondbc.AuraEffectSchoolAbsorb
	// Fallback path (WotLK): EffectAuraName not populated, rely on DBC scan.
	fallback := ac.EffectAuraName == chrondbc.AuraEffectNone && absorbEffect >= 0
	if !explicit && !fallback {
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

	// Backfill capacity, school mask, and duration from DBC spell data.
	if absorbEffect >= 0 {
		base := ac.Spell.EffectBasePoints[absorbEffect]
		dice := ac.Spell.EffectDieSides[absorbEffect]
		// Use 2x capacity as a soft upper bound to account for talents
		// (Improved PW:S), spell power scaling, and private server
		// customizations.
		shield.estRemaining = (base + dice) * 2

		if shield.schoolMask == 0 {
			shield.schoolMask = types.School(ac.Spell.EffectMiscValue[absorbEffect])
		}
		if shield.durationMS == 0 {
			shield.durationMS = ac.Spell.Duration.Duration
		}
	}

	a.activeShields[target] = append(a.activeShields[target], shield)
}

// processAuraFade removes a tracked shield when its aura fades.
// In WotLK CLEU this is SPELL_AURA_REMOVED and is reliable; in vanilla it is
// the client-side BUFF_REM and only fires for buffs visible to the recording
// player — duration expiry covers the rest.
func (a *Absorption) processAuraFade(aura *messages.Aura) {
	if !aura.IsBuff || aura.State != types.AuraStateRemoved {
		return
	}

	shields := a.activeShields[aura.Target]
	for i, s := range shields {
		if s.spellName == aura.SpellName {
			a.activeShields[aura.Target] = append(shields[:i], shields[i+1:]...)
			return
		}
	}
}

// expireShields removes shields whose duration has elapsed at the given time.
func (a *Absorption) expireShields(target guid.GUID, now time.Time) {
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

func (a *Absorption) processDamage(dmg *messages.Damage) *messages.Absorbed {
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
