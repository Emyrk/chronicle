package regexs

import (
	"regexp"
)

// From LegacyPlayer
var (
	ReDamageHitOrCrit                   = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
	ReDamageHitOrCritSchool             = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+) ([a-zA-Z]+) damage\.\s?(.*)`)
	ReDamageMiss                        = regexp.MustCompile(`(.+[^\s]) misses (.+[^\s])\.`)
	ReDamageBlockParryEvadeDodgeDeflect = regexp.MustCompile(`(.+[^\s]) attacks\. (.+[^\s]) (blocks|parries|evades|dodges|deflects)\.`)
	ReDamageAbsorbResist                = regexp.MustCompile(`(.+[^\s]) attacks\. (.+[^\s]) (absorbs|resists) all the damage\.`)
	ReDamageImmune                      = regexp.MustCompile(`(.+[^\s]) attacks but (.+[^\s]) is immune\.`)

	ReDamageSpellHitOrCrit                         = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
	ReDamageSpellHitOrCritSchool                   = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) (cr|h)its (.+[^\s]) for (\d+) ([a-zA-Z]+) damage\.\s?(.*)`)
	ReDamagePeriodic                               = regexp.MustCompile(`(.+[^\s]) suffers (\d+) ([a-zA-Z]+) damage from (.+[^\s])\s's (.+[^\s])\.\s?(.*)`)
	ReDamageSpellSplit                             = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) causes (.+[^\s]) (\d+) damage\.\s?(.*)`)
	ReDamageSpellMiss                              = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) misse(s|d) (.+[^\s])\.`)
	ReDamageSpellBlockParryEvadeDodgeResistDeflect = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) was (blocked|parried|evaded|dodged|resisted|deflected) by (.+[^\s])\.`)
	ReDamageSpellAbsorb                            = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is absorbed by (.+[^\s])\.`)
	ReDamageSpellAbsorbSelf                        = regexp.MustCompile(`(.+[^\s]) absorbs (.+[^\s])\s's (.+[^\s])\.`)
	ReDamageReflect                                = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is reflected back by (.+[^\s])\.`)
	ReDamageProcResist                             = regexp.MustCompile(`(.+[^\s]) resists (.+[^\s])\s's (.+[^\s])\.`)
	ReDamageSpellImmune                            = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) fails\. (.+[^\s]) is immune\.`)
	ReSpellCastAttempt                             = regexp.MustCompile(`(.+[^\s]) begins to (cast|perform) (.+[^\s])\.`)

	ReDamageShield = regexp.MustCompile(`(.+[^\s]) reflects (\d+) ([a-zA-Z]+) damage to (.+[^\s])\.`)

	ReHealHit  = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) heals (.+[^\s]) for (\d+)\.`)
	ReHealCrit = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) critically heals (.+[^\s]) for (\d+)\.`)
	ReGain     = regexp.MustCompile(`(.+[^\s]) (gains|loses) (\d+) (Health|health|Mana|Rage|Energy|Happiness|happiness|Focus) from (.+[^\s])\s's (.+[^\s])\.`)

	ReAuraGainHarmfulHelpful = regexp.MustCompile(`(.+[^\s]) (is afflicted by|gains) (.+[^\s]) \((\d+)\)\.`)
	ReAuraFade               = regexp.MustCompile(`(.+[^\s]) fades from (.+[^\s])\.`)

	ReAuraDispel    = regexp.MustCompile(`(.+[^\s])\s's (.+[^\s]) is removed\.`)
	ReAuraInterrupt = regexp.MustCompile(`(.+[^\s]) interrupts (.+[^\s])\s's (.+[^\s])\.`)

	ReSpellCastPerformDurability = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s]) on (.+[^\s]): (.+)\.`)
	ReSpellCastPerform           = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s]) on (.+[^\s])\.`)
	ReSpellCastPerformUnknown    = regexp.MustCompile(`(.+[^\s]) (casts|performs) (.+[^\s])\.`)

	ReUnitDieDestroyed = regexp.MustCompile(`(.+[^\s]) (dies|is destroyed)\.`)
	ReUnitSlay         = regexp.MustCompile(`(.+[^\s]) is slain by (.+[^\s])(!|\.)`)

	ReZoneInfo = regexp.MustCompile(`ZONE_INFO: ([^&]+)&(.+[^\s])\&(\d+)`)
	ReLoot     = regexp.MustCompile(`LOOT: ([^&]+)&(.+[^\s]) receives loot: \|c([a-zA-Z0-9]+)\|Hitem:(\d+):(\d+):(\d+):(\d+)\|h\[([a-zA-Z0-9\s']+)\]\|h\|rx(\d+)\.`)

	// Bug pattern
	ReBugDamageSpellHitOrCrit = regexp.MustCompile(`(.+[^\s])\s's (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
)

// From myself
var (
	ReCreates      = regexp.MustCompile(`(.+[^\s]) (creates) (.+[^\s])\.`)
	ReGainsAttack  = regexp.MustCompile(`(.+[^\s]) gains (\d+) extra attack through (.+[^\s])\.`)
	ReFallDamage   = regexp.MustCompile(`(.+[^\s]) falls and loses (\d+) health\.`)
	ReGainNoSource = regexp.MustCompile(`(.+[^\s]) (gains|loses) (\d+) (Health|health|Mana|Rage|Energy|Happiness|happiness|Focus)\.`)
)

// ???
// 10/29 22:28:09.244  Kryaa 's Naga loses 51 happiness.
