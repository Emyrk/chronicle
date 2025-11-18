package parser

import (
	"regexp"
	"sync"
)

// Compiled regexes - initialized once using sync.Once
var (
	reDamageHitOrCrit                         *regexp.Regexp
	reDamageHitOrCritSchool                   *regexp.Regexp
	reDamageMiss                              *regexp.Regexp
	reDamageBlockParryEvadeDodgeDeflect       *regexp.Regexp
	reDamageAbsorbResist                      *regexp.Regexp
	reDamageImmune                            *regexp.Regexp
	reDamageSpellHitOrCrit                    *regexp.Regexp
	reDamageSpellHitOrCritSchool              *regexp.Regexp
	reDamagePeriodic                          *regexp.Regexp
	reDamageSpellSplit                        *regexp.Regexp
	reDamageSpellMiss                         *regexp.Regexp
	reDamageSpellBlockParryEvadeDodgeResistDeflect *regexp.Regexp
	reDamageSpellAbsorb                       *regexp.Regexp
	reDamageSpellAbsorbSelf                   *regexp.Regexp
	reDamageReflect                           *regexp.Regexp
	reDamageProcResist                        *regexp.Regexp
	reDamageSpellImmune                       *regexp.Regexp
	reSpellCastAttempt                        *regexp.Regexp
	reDamageShield                            *regexp.Regexp
	reHealHit                                 *regexp.Regexp
	reHealCrit                                *regexp.Regexp
	reGain                                    *regexp.Regexp
	reAuraGainHarmfulHelpful                  *regexp.Regexp
	reAuraFade                                *regexp.Regexp
	reAuraDispel                              *regexp.Regexp
	reAuraInterrupt                           *regexp.Regexp
	reSpellCastPerformDurability              *regexp.Regexp
	reSpellCastPerform                        *regexp.Regexp
	reSpellCastPerformUnknown                 *regexp.Regexp
	reUnitDieDestroyed                        *regexp.Regexp
	reUnitSlay                                *regexp.Regexp
	reZoneInfo                                *regexp.Regexp
	reLoot                                    *regexp.Regexp
	reBugDamageSpellHitOrCrit                 *regexp.Regexp

	regexOnce sync.Once
)

// initRegexes initializes all regex patterns once
func initRegexes() {
	regexOnce.Do(func() {
		reDamageHitOrCrit = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
		reDamageHitOrCritSchool = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+) ([a-zA-Z]+) damage\.\s?(.*)`)
		reDamageMiss = regexp.MustCompile(`(.+[^\s]) misses (.+[^\s])\.`)
		reDamageBlockParryEvadeDodgeDeflect = regexp.MustCompile(`(.+[^\s]) attacks\. (.+[^\s]) (blocks|parries|evades|dodges|deflects)\.`)
		reDamageAbsorbResist = regexp.MustCompile(`(.+[^\s]) attacks\. (.+[^\s]) (absorbs|resists) all the damage\.`)
		reDamageImmune = regexp.MustCompile(`(.+[^\s]) attacks but (.+[^\s]) is immune\.`)

		reDamageSpellHitOrCrit = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
		reDamageSpellHitOrCritSchool = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+) ([a-zA-Z]+) damage\.\s?(.*)`)
		reDamagePeriodic = regexp.MustCompile(`(.+[^\s]) suffers (\d+) ([a-zA-Z]+) damage from (.+[^\s])\s's (.+[^\s])\.\s?(.*)`)
		reDamageSpellSplit = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) causes (.+[^\s]) (\d+) damage\.\s?(.*)`)
		reDamageSpellMiss = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) misse(s|d) (.+[^\s])\.`)
		reDamageSpellBlockParryEvadeDodgeResistDeflect = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) was (blocked|parried|evaded|dodged|resisted|deflected) by (.+[^\s])\.`)
		reDamageSpellAbsorb = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is absorbed by (.+[^\s])\.`)
		reDamageSpellAbsorbSelf = regexp.MustCompile(`(.+[^\s]) absorbs (.+[^\s])\s's (.+[^\s])\.`)
		reDamageReflect = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is reflected back by (.+[^\s])\.`)
		reDamageProcResist = regexp.MustCompile(`(.+[^\s]) resists (.+[^\s])\s's (.+[^\s])\.`)
		reDamageSpellImmune = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) fails\. (.+[^\s]) is immune\.`)
		reSpellCastAttempt = regexp.MustCompile(`(.+[^\s]) begins to cast (.+[^\s])\.`)

		reDamageShield = regexp.MustCompile(`(.+[^\s]) reflects (\d+) ([a-zA-Z]+) damage to (.+[^\s])\.`)

		reHealHit = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) heals (.+[^\s]) for (\d+)\.`)
		reHealCrit = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) critically heals (.+[^\s]) for (\d+)\.`)
		reGain = regexp.MustCompile(`(.+[^\s]) gains (\d+) (Health|health|Mana|Rage|Energy|Happiness|Focus) from (.+[^\s])\s's (.+[^\s])\.`)

		reAuraGainHarmfulHelpful = regexp.MustCompile(`(.+[^\s]) (is afflicted by|gains) (.+[^\s]) \((\d+)\)\.`)
		reAuraFade = regexp.MustCompile(`(.+[^\s]) fades from (.+[^\s])\.`)

		reAuraDispel = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is removed\.`)
		reAuraInterrupt = regexp.MustCompile(`(.+[^\s]) interrupts (.+[^\s])\s's (.+[^\s])\.`)

		reSpellCastPerformDurability = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s]) on (.+[^\s]): (.+)\.`)
		reSpellCastPerform = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s]) on (.+[^\s])\.`)
		reSpellCastPerformUnknown = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s])\.`)

		reUnitDieDestroyed = regexp.MustCompile(`(.+[^\s]) (dies|is destroyed)\.`)
		reUnitSlay = regexp.MustCompile(`(.+[^\s]) is slain by (.+[^\s])(!|\.)`)

		reZoneInfo = regexp.MustCompile(`ZONE_INFO: ([^&]+)&(.+[^\s])\&(\d+)`)
		reLoot = regexp.MustCompile(`LOOT: ([^&]+)&(.+[^\s]) receives loot: \|c([a-zA-Z0-9]+)\|Hitem:(\d+):(\d+):(\d+):(\d+)\|h\[([a-zA-Z0-9\s']+)\]\|h\|rx(\d+)\.`)

		// Bug pattern
		reBugDamageSpellHitOrCrit = regexp.MustCompile(`(.+[^\s])\s's (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
	})
}

// MessageType represents a parsed combat log message
// This is a placeholder - adjust to match your actual type
type MessageType interface{}

// Data represents the parser data context
// This is a placeholder - adjust to match your actual type
type Data interface{}

// Parser holds the parsing state
type Parser struct {
	// Add your fields here as needed
}

// ParseCBLLine parses a combat log line and returns parsed message types
// Returns nil if the line should be ignored (e.g., bug patterns)
func (p *Parser) ParseCBLLine(data Data, eventTs uint64, content string) []MessageType {
	// Initialize regexes on first call
	initRegexes()

	// Check for bug patterns and return nil if matched
	if reBugDamageSpellHitOrCrit.MatchString(content) {
		return nil
	}

	// TODO: Add your parsing logic here
	// The rest of the function would contain the actual parsing logic
	// based on matching the various regex patterns
	
	return nil
}
