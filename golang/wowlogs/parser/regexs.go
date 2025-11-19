package parser

import (
	"regexp"
)

// From LegacyPlayer
var (
	reDamageHitOrCrit                   = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
	reDamageHitOrCritSchool             = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+) ([a-zA-Z]+) damage\.\s?(.*)`)
	reDamageMiss                        = regexp.MustCompile(`(.+[^\s]) misses (.+[^\s])\.`)
	reDamageBlockParryEvadeDodgeDeflect = regexp.MustCompile(`(.+[^\s]) attacks\. (.+[^\s]) (blocks|parries|evades|dodges|deflects)\.`)
	reDamageAbsorbResist                = regexp.MustCompile(`(.+[^\s]) attacks\. (.+[^\s]) (absorbs|resists) all the damage\.`)
	reDamageImmune                      = regexp.MustCompile(`(.+[^\s]) attacks but (.+[^\s]) is immune\.`)

	reDamageSpellHitOrCrit                         = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
	reDamageSpellHitOrCritSchool                   = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+) ([a-zA-Z]+) damage\.\s?(.*)`)
	reDamagePeriodic                               = regexp.MustCompile(`(.+[^\s]) suffers (\d+) ([a-zA-Z]+) damage from (.+[^\s])\s's (.+[^\s])\.\s?(.*)`)
	reDamageSpellSplit                             = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) causes (.+[^\s]) (\d+) damage\.\s?(.*)`)
	reDamageSpellMiss                              = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) misse(s|d) (.+[^\s])\.`)
	reDamageSpellBlockParryEvadeDodgeResistDeflect = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) was (blocked|parried|evaded|dodged|resisted|deflected) by (.+[^\s])\.`)
	reDamageSpellAbsorb                            = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is absorbed by (.+[^\s])\.`)
	reDamageSpellAbsorbSelf                        = regexp.MustCompile(`(.+[^\s]) absorbs (.+[^\s])\s's (.+[^\s])\.`)
	reDamageReflect                                = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is reflected back by (.+[^\s])\.`)
	reDamageProcResist                             = regexp.MustCompile(`(.+[^\s]) resists (.+[^\s])\s's (.+[^\s])\.`)
	reDamageSpellImmune                            = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) fails\. (.+[^\s]) is immune\.`)
	reSpellCastAttempt                             = regexp.MustCompile(`(.+[^\s]) begins to (cast|perform) (.+[^\s])\.`)

	reDamageShield = regexp.MustCompile(`(.+[^\s]) reflects (\d+) ([a-zA-Z]+) damage to (.+[^\s])\.`)

	reHealHit  = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) heals (.+[^\s]) for (\d+)\.`)
	reHealCrit = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) critically heals (.+[^\s]) for (\d+)\.`)
	reGain     = regexp.MustCompile(`(.+[^\s]) (gains|loses) (\d+) (Health|health|Mana|Rage|Energy|Happiness|happiness|Focus) from (.+[^\s])\s's (.+[^\s])\.`)

	reAuraGainHarmfulHelpful = regexp.MustCompile(`(.+[^\s]) (is afflicted by|gains) (.+[^\s]) \((\d+)\)\.`)
	reAuraFade               = regexp.MustCompile(`(.+[^\s]) fades from (.+[^\s])\.`)

	reAuraDispel    = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is removed\.`)
	reAuraInterrupt = regexp.MustCompile(`(.+[^\s]) interrupts (.+[^\s])\s's (.+[^\s])\.`)

	reSpellCastPerformDurability = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s]) on (.+[^\s]): (.+)\.`)
	reSpellCastPerform           = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s]) on (.+[^\s])\.`)
	reSpellCastPerformUnknown    = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s])\.`)

	reUnitDieDestroyed = regexp.MustCompile(`(.+[^\s]) (dies|is destroyed)\.`)
	reUnitSlay         = regexp.MustCompile(`(.+[^\s]) is slain by (.+[^\s])(!|\.)`)

	reZoneInfo = regexp.MustCompile(`ZONE_INFO: ([^&]+)&(.+[^\s])\&(\d+)`)
	reLoot     = regexp.MustCompile(`LOOT: ([^&]+)&(.+[^\s]) receives loot: \|c([a-zA-Z0-9]+)\|Hitem:(\d+):(\d+):(\d+):(\d+)\|h\[([a-zA-Z0-9\s']+)\]\|h\|rx(\d+)\.`)

	// Bug pattern
	reBugDamageSpellHitOrCrit = regexp.MustCompile(`(.+[^\s])\s's (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
)

// From myself
var (
	reCreates      = regexp.MustCompile(`(.+[^\s]) (creates) (.+[^\s])\.`)
	reGainsAttack  = regexp.MustCompile(`(.+[^\s]) gains (\d+) extra attack through (.+[^\s])\.`)
	reFallDamage   = regexp.MustCompile(`(.+[^\s]) falls and loses (\d+) health\.`)
	reGainNoSource = regexp.MustCompile(`(.+[^\s]) (gains|loses) (\d+) (Health|health|Mana|Rage|Energy|Happiness|happiness|Focus)\.`)
)

// ???
// 10/29 22:28:09.244  Kryaa 's Naga loses 51 happiness.
