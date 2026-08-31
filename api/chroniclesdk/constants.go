//go:generate go tool go-enum -f constants.go --nocase --values
package chroniclesdk

// ENUM(damage,heal,resource_change,extra_attack,slain,ressurection,cast,aura,spell_go,aura_cast,spell_start,spell_fail,unit_classification,dispel,combatant_info,interrupt,absorbed,companion_stats,consume,raid_group)
type WoWEventType string

// ENUM(Raiding,Dungeons,PvP,Hardcore,Casual,Leveling,Social,RP,Questing,English,German,Spanish,French,Korean,Portuguese,Russian,Chinese,Taiwanese)
type GuildTag string

// ENUM(discord,youtube,twitch,twitter,website)
type SocialPlatform string
