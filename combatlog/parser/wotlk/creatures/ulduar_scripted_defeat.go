package creatures

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

const (
	scriptedKeeperAuraCleanupThreshold = 8
	kologarnAuraCleanupThreshold       = 7
	algalonAuraCleanupThreshold        = 12
	scriptedAuraCleanupBurstWindow     = 100 * time.Millisecond
	scriptedAuraCleanupDamageWindow    = 500 * time.Millisecond
	freyaEvadeConfirmationWindow       = 5 * time.Second
	thorimEvadeConfirmationWindow      = 5 * time.Second
)

func algalonDefeatConfig() characters.ScriptedDefeatConfig {
	return characters.ScriptedDefeatConfig{
		AuraCleanup: characters.AuraCleanupDefeatConfig{
			DistinctAuras: algalonAuraCleanupThreshold,
			BurstWindow:   scriptedAuraCleanupBurstWindow,
			DamageWindow:  scriptedAuraCleanupDamageWindow,
		},
	}
}

func scriptedSurrenderHitConfig() characters.ScriptedDefeatConfig {
	return characters.ScriptedDefeatConfig{
		PositiveOverkill: true,
		Evade:            true,
	}
}

func freyaDefeatConfig() characters.ScriptedDefeatConfig {
	config := scriptedSurrenderWithAuraCleanupConfig(scriptedKeeperAuraCleanupThreshold)
	config.EvadeConfirmationWindow = freyaEvadeConfirmationWindow
	return config
}

func kologarnDefeatConfig() characters.ScriptedDefeatConfig {
	return scriptedSurrenderWithAuraCleanupConfig(kologarnAuraCleanupThreshold)
}

// Hodir, Freya, and Kologarn client logs sometimes omit both the triggering
// overkill and a queued evade, leaving only the guarded aura-cleanup burst.
// Thorim uses the same detector but not this fallback: observed Thorim wipes can
// produce an indistinguishable cleanup burst immediately after incoming damage.
func scriptedSurrenderWithAuraCleanupConfig(distinctAuras int) characters.ScriptedDefeatConfig {
	config := scriptedSurrenderHitConfig()
	config.AuraCleanup = characters.AuraCleanupDefeatConfig{
		DistinctAuras: distinctAuras,
		BurstWindow:   scriptedAuraCleanupBurstWindow,
		DamageWindow:  scriptedAuraCleanupDamageWindow,
	}
	return config
}
