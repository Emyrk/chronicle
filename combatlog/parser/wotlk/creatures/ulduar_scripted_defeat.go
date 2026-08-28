package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const (
	scriptedKeeperAuraCleanupThreshold    = 8
	scriptedKeeperAuraCleanupBurstWindow  = 100 * time.Millisecond
	scriptedKeeperAuraCleanupDamageWindow = 500 * time.Millisecond
)

func scriptedSurrenderHitConfig() characters.ScriptedDefeatConfig {
	return characters.ScriptedDefeatConfig{
		PositiveOverkill: true,
		Evade:            true,
	}
}

// Hodir and Freya client logs sometimes omit both the triggering overkill and a
// queued evade, leaving only the guarded aura-cleanup burst. Thorim uses the
// same detector but not this fallback: observed Thorim wipes can produce an
// indistinguishable cleanup burst immediately after incoming damage.
func scriptedSurrenderWithAuraCleanupConfig() characters.ScriptedDefeatConfig {
	config := scriptedSurrenderHitConfig()
	config.AuraCleanup = characters.AuraCleanupDefeatConfig{
		DistinctAuras: scriptedKeeperAuraCleanupThreshold,
		BurstWindow:   scriptedKeeperAuraCleanupBurstWindow,
		DamageWindow:  scriptedKeeperAuraCleanupDamageWindow,
	}
	return config
}
