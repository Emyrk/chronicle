package parserv2

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
)

type SwingHitInfo = next.SwingHitInfo
type VictimState = next.VictimState

const (
	HITINFO_NORMALSWING     = next.HITINFO_NORMALSWING
	HITINFO_UNK0            = next.HITINFO_UNK0
	HITINFO_AFFECTS_VICTIM  = next.HITINFO_AFFECTS_VICTIM
	HITINFO_LEFTSWING       = next.HITINFO_LEFTSWING
	HITINFO_UNK3            = next.HITINFO_UNK3
	HITINFO_MISS            = next.HITINFO_MISS
	HITINFO_ABSORB          = next.HITINFO_ABSORB
	HITINFO_RESIST          = next.HITINFO_RESIST
	HITINFO_CRITICALHIT     = next.HITINFO_CRITICALHIT
	HITINFO_UNK8            = next.HITINFO_UNK8
	HITINFO_UNK9            = next.HITINFO_UNK9
	HITINFO_GLANCING        = next.HITINFO_GLANCING
	HITINFO_CRUSHING        = next.HITINFO_CRUSHING
	HITINFO_NOACTION        = next.HITINFO_NOACTION
	HITINFO_SWINGNOHITSOUND = next.HITINFO_SWINGNOHITSOUND
	VICTIMSTATE_UNAFFECTED  = next.VICTIMSTATE_UNAFFECTED
	VICTIMSTATE_NORMAL      = next.VICTIMSTATE_NORMAL
	VICTIMSTATE_DODGE       = next.VICTIMSTATE_DODGE
	VICTIMSTATE_PARRY       = next.VICTIMSTATE_PARRY
	VICTIMSTATE_INTERRUPT   = next.VICTIMSTATE_INTERRUPT
	VICTIMSTATE_BLOCKS      = next.VICTIMSTATE_BLOCKS
	VICTIMSTATE_EVADES      = next.VICTIMSTATE_EVADES
	VICTIMSTATE_IS_IMMUNE   = next.VICTIMSTATE_IS_IMMUNE
	VICTIMSTATE_DEFLECTS    = next.VICTIMSTATE_DEFLECTS
)

func HitType(amount, components int32, info SwingHitInfo, state VictimState) types.HitType {
	return next.HitType(amount, components, info, state)
}
func Trailer(blocked, absorbed, resisted int32) types.Trailer {
	return next.Trailer(blocked, absorbed, resisted)
}
func BlockTrailer(amount int32) types.TrailerEntry { return next.BlockTrailer(amount) }
func Resisted(amount int32) types.TrailerEntry     { return next.Resisted(amount) }
func Absorbed(amount int32) types.TrailerEntry     { return next.Absorbed(amount) }
func School(s int32) types.School                  { return next.School(s) }

type SpellMissInfo int32

const (
	SPELL_MISS_NONE    SpellMissInfo = 0  //   -- No miss (shouldn't normally appear)
	SPELL_MISS_MISS    SpellMissInfo = 1  //   -- Miss
	SPELL_MISS_RESIST  SpellMissInfo = 2  //   -- Resist (also used for SMSG_PROCRESIST)
	SPELL_MISS_DODGE   SpellMissInfo = 3  //   -- Dodge
	SPELL_MISS_PARRY   SpellMissInfo = 4  //   -- Parry
	SPELL_MISS_BLOCK   SpellMissInfo = 5  //   -- Block
	SPELL_MISS_EVADE   SpellMissInfo = 6  //   -- Evade
	SPELL_MISS_IMMUNE  SpellMissInfo = 7  //   -- Immune
	SPELL_MISS_IMMUNE2 SpellMissInfo = 8  //   -- Immune (variant)
	SPELL_MISS_DEFLECT SpellMissInfo = 9  //   -- Deflect
	SPELL_MISS_ABSORB  SpellMissInfo = 10 //  -- Absorb
	SPELL_MISS_REFLECT SpellMissInfo = 11 //  -- Reflect
)

//go:generate stringer -type AuraEffect -trimprefix AuraEffect
type AuraEffect int32

const (
	SPELL_AURA_NONE                               AuraEffect = 0
	SPELL_AURA_BIND_SIGHT                         AuraEffect = 1
	SPELL_AURA_MOD_POSSESS                        AuraEffect = 2
	SPELL_AURA_PERIODIC_DAMAGE                    AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_DAMAGE)
	SPELL_AURA_DUMMY                              AuraEffect = 4
	SPELL_AURA_MOD_CONFUSE                        AuraEffect = 5
	SPELL_AURA_MOD_CHARM                          AuraEffect = 6
	SPELL_AURA_MOD_FEAR                           AuraEffect = 7
	SPELL_AURA_PERIODIC_HEAL                      AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_HEAL)
	SPELL_AURA_MOD_ATTACKSPEED                    AuraEffect = 9
	SPELL_AURA_MOD_THREAT                         AuraEffect = 10
	SPELL_AURA_MOD_TAUNT                          AuraEffect = 11
	SPELL_AURA_MOD_STUN                           AuraEffect = 12
	SPELL_AURA_MOD_DAMAGE_DONE                    AuraEffect = 13
	SPELL_AURA_MOD_DAMAGE_TAKEN                   AuraEffect = 14
	SPELL_AURA_DAMAGE_SHIELD                      AuraEffect = 15
	SPELL_AURA_MOD_STEALTH                        AuraEffect = 16
	SPELL_AURA_MOD_DETECT                         AuraEffect = 17
	SPELL_AURA_MOD_INVISIBILITY                   AuraEffect = 18
	SPELL_AURA_MOD_INVISIBILITY_DETECTION         AuraEffect = 19
	SPELL_AURA_OBS_MOD_HEALTH                     AuraEffect = 20 //20,21 unofficial
	SPELL_AURA_OBS_MOD_MANA                       AuraEffect = 21
	SPELL_AURA_MOD_RESISTANCE                     AuraEffect = 22
	SPELL_AURA_PERIODIC_TRIGGER_SPELL             AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_TRIGGER_SPELL)
	SPELL_AURA_PERIODIC_ENERGIZE                  AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_ENERGIZE)
	SPELL_AURA_MOD_PACIFY                         AuraEffect = 25
	SPELL_AURA_MOD_ROOT                           AuraEffect = 26
	SPELL_AURA_MOD_SILENCE                        AuraEffect = 27
	SPELL_AURA_REFLECT_SPELLS                     AuraEffect = 28
	SPELL_AURA_MOD_STAT                           AuraEffect = 29
	SPELL_AURA_MOD_SKILL                          AuraEffect = 30
	SPELL_AURA_MOD_INCREASE_SPEED                 AuraEffect = 31
	SPELL_AURA_MOD_INCREASE_MOUNTED_SPEED         AuraEffect = 32
	SPELL_AURA_MOD_DECREASE_SPEED                 AuraEffect = 33
	SPELL_AURA_MOD_INCREASE_HEALTH                AuraEffect = 34
	SPELL_AURA_MOD_INCREASE_ENERGY                AuraEffect = 35
	SPELL_AURA_MOD_SHAPESHIFT                     AuraEffect = 36
	SPELL_AURA_EFFECT_IMMUNITY                    AuraEffect = 37
	SPELL_AURA_STATE_IMMUNITY                     AuraEffect = 38
	SPELL_AURA_SCHOOL_IMMUNITY                    AuraEffect = 39
	SPELL_AURA_DAMAGE_IMMUNITY                    AuraEffect = 40
	SPELL_AURA_DISPEL_IMMUNITY                    AuraEffect = 41
	SPELL_AURA_PROC_TRIGGER_SPELL                 AuraEffect = 42
	SPELL_AURA_PROC_TRIGGER_DAMAGE                AuraEffect = 43
	SPELL_AURA_TRACK_CREATURES                    AuraEffect = 44
	SPELL_AURA_TRACK_RESOURCES                    AuraEffect = 45
	SPELL_AURA_MOD_PARRY_SKILL                    AuraEffect = 46
	SPELL_AURA_MOD_PARRY_PERCENT                  AuraEffect = 47
	SPELL_AURA_MOD_DODGE_SKILL                    AuraEffect = 48
	SPELL_AURA_MOD_DODGE_PERCENT                  AuraEffect = 49
	SPELL_AURA_MOD_BLOCK_SKILL                    AuraEffect = 50
	SPELL_AURA_MOD_BLOCK_PERCENT                  AuraEffect = 51
	SPELL_AURA_MOD_CRIT_PERCENT                   AuraEffect = 52
	SPELL_AURA_PERIODIC_LEECH                     AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_LEECH)
	SPELL_AURA_MOD_HIT_CHANCE                     AuraEffect = 54
	SPELL_AURA_MOD_SPELL_HIT_CHANCE               AuraEffect = 55
	SPELL_AURA_TRANSFORM                          AuraEffect = 56
	SPELL_AURA_MOD_SPELL_CRIT_CHANCE              AuraEffect = 57
	SPELL_AURA_MOD_INCREASE_SWIM_SPEED            AuraEffect = 58
	SPELL_AURA_MOD_DAMAGE_DONE_CREATURE           AuraEffect = 59
	SPELL_AURA_MOD_PACIFY_SILENCE                 AuraEffect = 60
	SPELL_AURA_MOD_SCALE                          AuraEffect = 61
	SPELL_AURA_PERIODIC_HEALTH_FUNNEL             AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_HEALTH_FUNNEL)
	SPELL_AURA_PERIODIC_MANA_FUNNEL               AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_MANA_FUNNEL)
	SPELL_AURA_PERIODIC_MANA_LEECH                AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_MANA_LEECH)
	SPELL_AURA_MOD_CASTING_SPEED                  AuraEffect = 65
	SPELL_AURA_FEIGN_DEATH                        AuraEffect = 66
	SPELL_AURA_MOD_DISARM                         AuraEffect = 67
	SPELL_AURA_MOD_STALKED                        AuraEffect = 68
	SPELL_AURA_SCHOOL_ABSORB                      AuraEffect = 69
	SPELL_AURA_EXTRA_ATTACKS                      AuraEffect = 70
	SPELL_AURA_MOD_SPELL_CRIT_CHANCE_SCHOOL       AuraEffect = 71
	SPELL_AURA_MOD_POWER_COST_SCHOOL_PCT          AuraEffect = 72
	SPELL_AURA_MOD_POWER_COST_SCHOOL              AuraEffect = 73
	SPELL_AURA_REFLECT_SPELLS_SCHOOL              AuraEffect = 74
	SPELL_AURA_MOD_LANGUAGE                       AuraEffect = 75
	SPELL_AURA_FAR_SIGHT                          AuraEffect = 76
	SPELL_AURA_MECHANIC_IMMUNITY                  AuraEffect = 77
	SPELL_AURA_MOUNTED                            AuraEffect = 78
	SPELL_AURA_MOD_DAMAGE_PERCENT_DONE            AuraEffect = 79
	SPELL_AURA_MOD_PERCENT_STAT                   AuraEffect = 80
	SPELL_AURA_SPLIT_DAMAGE_PCT                   AuraEffect = 81
	SPELL_AURA_WATER_BREATHING                    AuraEffect = 82
	SPELL_AURA_MOD_BASE_RESISTANCE                AuraEffect = 83
	SPELL_AURA_MOD_REGEN                          AuraEffect = 84
	SPELL_AURA_MOD_POWER_REGEN                    AuraEffect = 85
	SPELL_AURA_CHANNEL_DEATH_ITEM                 AuraEffect = 86
	SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN           AuraEffect = 87
	SPELL_AURA_MOD_HEALTH_REGEN_PERCENT           AuraEffect = 88
	SPELL_AURA_PERIODIC_DAMAGE_PERCENT            AuraEffect = AuraEffect(next.SPELL_AURA_PERIODIC_DAMAGE_PERCENT)
	SPELL_AURA_MOD_RESIST_CHANCE                  AuraEffect = 90
	SPELL_AURA_MOD_DETECT_RANGE                   AuraEffect = 91
	SPELL_AURA_PREVENTS_FLEEING                   AuraEffect = 92
	SPELL_AURA_MOD_UNATTACKABLE                   AuraEffect = 93
	SPELL_AURA_INTERRUPT_REGEN                    AuraEffect = 94
	SPELL_AURA_GHOST                              AuraEffect = 95
	SPELL_AURA_SPELL_MAGNET                       AuraEffect = 96
	SPELL_AURA_MANA_SHIELD                        AuraEffect = 97
	SPELL_AURA_MOD_SKILL_TALENT                   AuraEffect = 98
	SPELL_AURA_MOD_ATTACK_POWER                   AuraEffect = 99
	SPELL_AURA_AURAS_VISIBLE                      AuraEffect = 100
	SPELL_AURA_MOD_RESISTANCE_PCT                 AuraEffect = 101
	SPELL_AURA_MOD_MELEE_ATTACK_POWER_VERSUS      AuraEffect = 102
	SPELL_AURA_MOD_TOTAL_THREAT                   AuraEffect = 103
	SPELL_AURA_WATER_WALK                         AuraEffect = 104
	SPELL_AURA_FEATHER_FALL                       AuraEffect = 105
	SPELL_AURA_HOVER                              AuraEffect = 106
	SPELL_AURA_ADD_FLAT_MODIFIER                  AuraEffect = 107
	SPELL_AURA_ADD_PCT_MODIFIER                   AuraEffect = 108
	SPELL_AURA_ADD_TARGET_TRIGGER                 AuraEffect = 109
	SPELL_AURA_MOD_POWER_REGEN_PERCENT            AuraEffect = 110
	SPELL_AURA_ADD_CASTER_HIT_TRIGGER             AuraEffect = 111
	SPELL_AURA_OVERRIDE_CLASS_SCRIPTS             AuraEffect = 112
	SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN            AuraEffect = 113
	SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN_PCT        AuraEffect = 114
	SPELL_AURA_MOD_HEALING                        AuraEffect = 115
	SPELL_AURA_MOD_REGEN_DURING_COMBAT            AuraEffect = 116
	SPELL_AURA_MOD_MECHANIC_RESISTANCE            AuraEffect = 117
	SPELL_AURA_MOD_HEALING_PCT                    AuraEffect = 118
	SPELL_AURA_SHARE_PET_TRACKING                 AuraEffect = 119
	SPELL_AURA_UNTRACKABLE                        AuraEffect = 120
	SPELL_AURA_EMPATHY                            AuraEffect = 121
	SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT             AuraEffect = 122
	SPELL_AURA_MOD_TARGET_RESISTANCE              AuraEffect = 123
	SPELL_AURA_MOD_RANGED_ATTACK_POWER            AuraEffect = 124
	SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN             AuraEffect = 125
	SPELL_AURA_MOD_MELEE_DAMAGE_TAKEN_PCT         AuraEffect = 126
	SPELL_AURA_RANGED_ATTACK_POWER_ATTACKER_BONUS AuraEffect = 127
	SPELL_AURA_MOD_POSSESS_PET                    AuraEffect = 128
	SPELL_AURA_MOD_SPEED_ALWAYS                   AuraEffect = 129
	SPELL_AURA_MOD_MOUNTED_SPEED_ALWAYS           AuraEffect = 130
	SPELL_AURA_MOD_RANGED_ATTACK_POWER_VERSUS     AuraEffect = 131
	SPELL_AURA_MOD_INCREASE_ENERGY_PERCENT        AuraEffect = 132
	SPELL_AURA_MOD_INCREASE_HEALTH_PERCENT        AuraEffect = 133
	SPELL_AURA_MOD_MANA_REGEN_INTERRUPT           AuraEffect = 134
	SPELL_AURA_MOD_HEALING_DONE                   AuraEffect = 135
	SPELL_AURA_MOD_HEALING_DONE_PERCENT           AuraEffect = 136
	SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE          AuraEffect = 137
	SPELL_AURA_MOD_HASTE                          AuraEffect = 138
	SPELL_AURA_FORCE_REACTION                     AuraEffect = 139
	SPELL_AURA_MOD_RANGED_HASTE                   AuraEffect = 140
	SPELL_AURA_MOD_RANGED_AMMO_HASTE              AuraEffect = 141
	SPELL_AURA_MOD_BASE_RESISTANCE_PCT            AuraEffect = 142
	SPELL_AURA_MOD_RESISTANCE_EXCLUSIVE           AuraEffect = 143
	SPELL_AURA_SAFE_FALL                          AuraEffect = 144
	SPELL_AURA_CHARISMA                           AuraEffect = 145
	SPELL_AURA_PERSUADED                          AuraEffect = 146
	SPELL_AURA_ADD_CREATURE_IMMUNITY              AuraEffect = 147
	SPELL_AURA_RETAIN_COMBO_POINTS                AuraEffect = 148
	SPELL_AURA_RESIST_PUSHBACK                    AuraEffect = 149 //    Resist Pushback
	SPELL_AURA_MOD_SHIELD_BLOCKVALUE_PCT          AuraEffect = 150
	SPELL_AURA_TRACK_STEALTHED                    AuraEffect = 151 //    Track Stealthed
	SPELL_AURA_MOD_DETECTED_RANGE                 AuraEffect = 152 //    Mod Detected Range
	SPELL_AURA_SPLIT_DAMAGE_FLAT                  AuraEffect = 153 //    Split Damage Flat
	SPELL_AURA_MOD_STEALTH_LEVEL                  AuraEffect = 154 //    Stealth Level Modifier
	SPELL_AURA_MOD_WATER_BREATHING                AuraEffect = 155 //    Mod Water Breathing
	SPELL_AURA_MOD_REPUTATION_GAIN                AuraEffect = 156 //    Mod Reputation Gain
	SPELL_AURA_PET_DAMAGE_MULTI                   AuraEffect = 157 //    Mod Pet Damage
	SPELL_AURA_MOD_SHIELD_BLOCKVALUE              AuraEffect = 158
	SPELL_AURA_NO_PVP_CREDIT                      AuraEffect = 159
	SPELL_AURA_MOD_AOE_AVOIDANCE                  AuraEffect = 160
	SPELL_AURA_MOD_HEALTH_REGEN_IN_COMBAT         AuraEffect = 161
	SPELL_AURA_POWER_BURN_MANA                    AuraEffect = AuraEffect(next.SPELL_AURA_POWER_BURN_MANA)

	//[TZERO] used in 1.12 ?
	SPELL_AURA_MOD_CRIT_DAMAGE_BONUS_MELEE       AuraEffect = 163
	SPELL_AURA_164                               AuraEffect = 164
	SPELL_AURA_MELEE_ATTACK_POWER_ATTACKER_BONUS AuraEffect = 165
	SPELL_AURA_MOD_ATTACK_POWER_PCT              AuraEffect = 166
	SPELL_AURA_MOD_RANGED_ATTACK_POWER_PCT       AuraEffect = 167
	SPELL_AURA_MOD_DAMAGE_DONE_VERSUS            AuraEffect = 168
	SPELL_AURA_MOD_CRIT_PERCENT_VERSUS           AuraEffect = 169
	SPELL_AURA_DETECT_AMORE                      AuraEffect = 170
	SPELL_AURA_MOD_SPEED_NOT_STACK               AuraEffect = 171
	SPELL_AURA_MOD_MOUNTED_SPEED_NOT_STACK       AuraEffect = 172
	SPELL_AURA_ALLOW_CHAMPION_SPELLS             AuraEffect = 173
	SPELL_AURA_MOD_SPELL_DAMAGE_OF_STAT_PERCENT  AuraEffect = 174 // by default intellect, dependent from SPELL_AURA_MOD_SPELL_HEALING_OF_STAT_PERCENT
	SPELL_AURA_MOD_SPELL_HEALING_OF_STAT_PERCENT AuraEffect = 175
	SPELL_AURA_SPIRIT_OF_REDEMPTION              AuraEffect = 176
	SPELL_AURA_AOE_CHARM                         AuraEffect = 177
	SPELL_AURA_MOD_DEBUFF_RESISTANCE             AuraEffect = 178
	SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE    AuraEffect = 179
	SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS      AuraEffect = 180
	SPELL_AURA_MOD_FLAT_SPELL_CRIT_DAMAGE_VERSUS AuraEffect = 181 // unused - possible flat spell crit damage versus
	SPELL_AURA_MOD_RESISTANCE_OF_STAT_PERCENT    AuraEffect = 182
	SPELL_AURA_MOD_CRITICAL_THREAT               AuraEffect = 183
	SPELL_AURA_MOD_ATTACKER_MELEE_HIT_CHANCE     AuraEffect = 184
	SPELL_AURA_MOD_ATTACKER_RANGED_HIT_CHANCE    AuraEffect = 185
	SPELL_AURA_MOD_ATTACKER_SPELL_HIT_CHANCE     AuraEffect = 186
	SPELL_AURA_MOD_ATTACKER_MELEE_CRIT_CHANCE    AuraEffect = 187
	SPELL_AURA_MOD_ATTACKER_RANGED_CRIT_CHANCE   AuraEffect = 188
	SPELL_AURA_MOD_RATING                        AuraEffect = 189
	SPELL_AURA_MOD_FACTION_REPUTATION_GAIN       AuraEffect = 190
	SPELL_AURA_USE_NORMAL_MOVEMENT_SPEED         AuraEffect = 191
	SPELL_AURA_HASTE_MELEE                       AuraEffect = 192

	//[TZERO] tbc enumerations  [?]
	SPELL_AURA_MELEE_SLOW                                AuraEffect = 193
	SPELL_AURA_MOD_DEPRICATED_1                          AuraEffect = 194 // not used now, old SPELL_AURA_MOD_SPELL_DAMAGE_OF_INTELLECT
	SPELL_AURA_MOD_DEPRICATED_2                          AuraEffect = 195 // not used now, old SPELL_AURA_MOD_SPELL_HEALING_OF_INTELLECT
	SPELL_AURA_MOD_COOLDOWN                              AuraEffect = 196 // only 24818 Noxious Breath
	SPELL_AURA_MOD_ATTACKER_SPELL_AND_WEAPON_CRIT_CHANCE AuraEffect = 197
	SPELL_AURA_MOD_ALL_WEAPON_SKILLS                     AuraEffect = 198
	SPELL_AURA_MOD_INCREASES_SPELL_PCT_TO_HIT            AuraEffect = 199
	SPELL_AURA_MOD_XP_PCT                                AuraEffect = 200
	SPELL_AURA_IGNORE_COMBAT_RESULT                      AuraEffect = 202
	SPELL_AURA_MOD_ATTACKER_MELEE_CRIT_DAMAGE            AuraEffect = 203
	SPELL_AURA_MOD_ATTACKER_RANGED_CRIT_DAMAGE           AuraEffect = 204
	SPELL_AURA_205                                       AuraEffect = 205 // unused
	SPELL_AURA_MOD_SPEED_MOUNTED                         AuraEffect = 206 // ? used in strange spells
	SPELL_AURA_210                                       AuraEffect = 210 // unused
	SPELL_AURA_MOD_FLIGHT_SPEED_NOT_STACK                AuraEffect = 211
	SPELL_AURA_MOD_RANGED_ATTACK_POWER_OF_STAT_PERCENT   AuraEffect = 212
	SPELL_AURA_MOD_RAGE_FROM_DAMAGE_DEALT                AuraEffect = 213
	SPELL_AURA_214                                       AuraEffect = 214
	SPELL_AURA_HASTE_SPELLS                              AuraEffect = 216
	SPELL_AURA_217                                       AuraEffect = 217
	SPELL_AURA_HASTE_RANGED                              AuraEffect = 218
	SPELL_AURA_MOD_MANA_REGEN_FROM_STAT                  AuraEffect = 219
	SPELL_AURA_MOD_RATING_FROM_STAT                      AuraEffect = 220
	SPELL_AURA_221                                       AuraEffect = 221
	SPELL_AURA_222                                       AuraEffect = 222
	SPELL_AURA_223                                       AuraEffect = 223
	SPELL_AURA_224                                       AuraEffect = 224
	SPELL_AURA_PRAYER_OF_MENDING                         AuraEffect = 225
	SPELL_AURA_PERIODIC_DUMMY                            AuraEffect = 226
	SPELL_AURA_227                                       AuraEffect = 227
	SPELL_AURA_DETECT_STEALTH                            AuraEffect = 228
	SPELL_AURA_MOD_AOE_DAMAGE_AVOIDANCE                  AuraEffect = 229
	SPELL_AURA_230                                       AuraEffect = 230
	SPELL_AURA_231                                       AuraEffect = 231
	SPELL_AURA_MECHANIC_DURATION_MOD                     AuraEffect = 232
	SPELL_AURA_233                                       AuraEffect = 233
	SPELL_AURA_MECHANIC_DURATION_MOD_NOT_STACK           AuraEffect = 234
	SPELL_AURA_MOD_DISPEL_RESIST                         AuraEffect = 235
	SPELL_AURA_236                                       AuraEffect = 236
	SPELL_AURA_MOD_SPELL_DAMAGE_OF_ATTACK_POWER          AuraEffect = 237
	SPELL_AURA_MOD_SPELL_HEALING_OF_ATTACK_POWER         AuraEffect = 238
	SPELL_AURA_MOD_SCALE_2                               AuraEffect = 239
	SPELL_AURA_MOD_EXPERTISE                             AuraEffect = 240
	SPELL_AURA_FORCE_MOVE_FORWARD                        AuraEffect = 241
	SPELL_AURA_MOD_SPELL_DAMAGE_FROM_HEALING             AuraEffect = 242
	SPELL_AURA_243                                       AuraEffect = 243
	SPELL_AURA_COMPREHEND_LANGUAGE                       AuraEffect = 244
	SPELL_AURA_MOD_DURATION_OF_MAGIC_EFFECTS             AuraEffect = 245
	SPELL_AURA_246                                       AuraEffect = 246
	SPELL_AURA_247                                       AuraEffect = 247
	SPELL_AURA_MOD_COMBAT_RESULT_CHANCE                  AuraEffect = 248
	SPELL_AURA_249                                       AuraEffect = 249
	SPELL_AURA_MOD_INCREASE_HEALTH_2                     AuraEffect = 250
	SPELL_AURA_MOD_ENEMY_DODGE                           AuraEffect = 251
	SPELL_AURA_252                                       AuraEffect = 252
	SPELL_AURA_253                                       AuraEffect = 253
	SPELL_AURA_254                                       AuraEffect = 254
	SPELL_AURA_255                                       AuraEffect = 255
	SPELL_AURA_256                                       AuraEffect = 256
	SPELL_AURA_257                                       AuraEffect = 257
	SPELL_AURA_258                                       AuraEffect = 258
	SPELL_AURA_259                                       AuraEffect = 259
	SPELL_AURA_260                                       AuraEffect = 260
	SPELL_AURA_261                                       AuraEffect = 261
	TOTAL_AURAS                                          AuraEffect = 262
)
