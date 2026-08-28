package characters

import (
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

// ScriptedDefeatSignal identifies the combat-log side effect that revealed a scripted defeat.
type ScriptedDefeatSignal string

const (
	ScriptedDefeatPositiveOverkill ScriptedDefeatSignal = "positive_overkill"
	ScriptedDefeatEvade            ScriptedDefeatSignal = "evade"
	ScriptedDefeatAuraCleanup      ScriptedDefeatSignal = "aura_cleanup"

	// ScriptedDefeatEvadeConfirmationWindow delays evade-based defeat so
	// subsequent boss damage can disprove a transient evade.
	ScriptedDefeatEvadeConfirmationWindow = 500 * time.Millisecond
)

// AuraCleanupDefeatConfig configures guarded mass-aura-removal detection.
type AuraCleanupDefeatConfig struct {
	DistinctAuras int
	BurstWindow   time.Duration
	DamageWindow  time.Duration
}

// ScriptedDefeatConfig selects the defeat signals recognized by a detector.
type ScriptedDefeatConfig struct {
	PositiveOverkill bool
	Evade            bool
	AuraCleanup      AuraCleanupDefeatConfig
}

// ScriptedDefeatDetector recognizes combat-log side effects produced by bosses
// that surrender instead of emitting a normal death event. It is separate from
// Character so encounters can compose it with Common, RoomMechanic, or another
// activity implementation and decide how a detected defeat ends that activity.
type ScriptedDefeatDetector struct {
	id     guid.GUID
	config ScriptedDefeatConfig
	active bool

	lastIncomingDamage time.Time
	pendingEvade       time.Time
	cleanupBurstStart  time.Time
	cleanupAuras       map[string]struct{}
}

func NewScriptedDefeatDetector(id guid.GUID, config ScriptedDefeatConfig) *ScriptedDefeatDetector {
	return &ScriptedDefeatDetector{
		id:           id,
		config:       config,
		cleanupAuras: make(map[string]struct{}),
	}
}

// Observe must be called after the character's activity implementation has
// processed the message. active is the character's resulting activity state.
func (d *ScriptedDefeatDetector) Observe(m messages.Message, active bool) (ScriptedDefeatSignal, bool) {
	if !active {
		d.Reset()
		return "", false
	}
	if !d.active {
		d.Reset()
		d.active = true
	}

	switch event := m.(type) {
	case *messages.Damage:
		if event.Target == d.id {
			if d.config.PositiveOverkill && event.Overkill > 0 {
				d.Reset()
				return ScriptedDefeatPositiveOverkill, true
			}
			if d.config.Evade && event.HitType.Has(types.HitTypeEvade) {
				if d.pendingEvade.IsZero() {
					d.pendingEvade = event.Date()
				}
			} else {
				sinceEvade := event.Date().Sub(d.pendingEvade)
				if !d.pendingEvade.IsZero() && sinceEvade >= 0 && sinceEvade < ScriptedDefeatEvadeConfirmationWindow {
					d.pendingEvade = time.Time{}
				}
				if isSuccessfulIncomingDamage(event) {
					d.lastIncomingDamage = event.Date()
				}
			}
		}
	case *messages.Aura:
		if d.observeAuraCleanup(event) {
			d.Reset()
			return ScriptedDefeatAuraCleanup, true
		}
	}

	if !d.pendingEvade.IsZero() && m.Date().Sub(d.pendingEvade) >= ScriptedDefeatEvadeConfirmationWindow {
		d.Reset()
		return ScriptedDefeatEvade, true
	}
	return "", false
}

func (d *ScriptedDefeatDetector) Reset() {
	d.active = false
	d.lastIncomingDamage = time.Time{}
	d.pendingEvade = time.Time{}
	d.cleanupBurstStart = time.Time{}
	clear(d.cleanupAuras)
}

func (d *ScriptedDefeatDetector) observeAuraCleanup(aura *messages.Aura) bool {
	config := d.config.AuraCleanup
	if config.DistinctAuras <= 0 || config.BurstWindow <= 0 || config.DamageWindow <= 0 {
		return false
	}
	if aura.Target != d.id || aura.State != types.AuraStateRemoved {
		return false
	}

	sinceDamage := aura.Date().Sub(d.lastIncomingDamage)
	if d.lastIncomingDamage.IsZero() || sinceDamage < 0 || sinceDamage > config.DamageWindow {
		d.resetCleanupBurst()
		return false
	}

	if d.cleanupBurstStart.IsZero() || aura.Date().Sub(d.cleanupBurstStart) > config.BurstWindow {
		d.resetCleanupBurst()
		d.cleanupBurstStart = aura.Date()
	}
	d.cleanupAuras[auraIdentity(aura)] = struct{}{}
	return len(d.cleanupAuras) >= config.DistinctAuras
}

func (d *ScriptedDefeatDetector) resetCleanupBurst() {
	d.cleanupBurstStart = time.Time{}
	clear(d.cleanupAuras)
}

func auraIdentity(aura *messages.Aura) string {
	if aura.SpellData != nil {
		return fmt.Sprintf("id:%d", aura.SpellData.ID)
	}
	return "name:" + aura.SpellName
}

func isSuccessfulIncomingDamage(damage *messages.Damage) bool {
	return damage.Amount > 0 &&
		!damage.HitType.Has(types.HitTypeImmune) &&
		!damage.HitType.Has(types.HitTypeEvade)
}
