package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

type Identity = identifier.Identity

func LoadAdds(src map[uint32]identifier.Identity, adds map[uint32]string) {
	for k, name := range adds {
		src[k] = identifier.Identity{Affiliation: types.AffiliationHostile, Name: name}
	}
}

func LoadBosses(src map[uint32]identifier.Identity, bosses map[uint32]string) {
	for k, name := range bosses {
		src[k] = identifier.Identity{Affiliation: types.AffiliationHostile, Name: name, EncounterName: name, Boss: true}
	}
}

func FromMaps(m ...map[uint32]identifier.Identity) func() *identifier.Identifier {
	merged := make(map[uint32]identifier.Identity)
	for _, mm := range m {
		for k, v := range mm {
			merged[k] = v
		}
	}
	return func() *identifier.Identifier {
		return identifier.NewIdentifier(merged)
	}
}

func FromMapFunc(f func(fl database.WoWFlavor) map[uint32]Identity) func(fl database.WoWFlavor) *identifier.Identifier {
	return func(fl database.WoWFlavor) *identifier.Identifier {
		return identifier.NewIdentifier(f(fl))
	}
}

func FromMap(m map[uint32]identifier.Identity) func(flavor database.WoWFlavor) *identifier.Identifier {
	return func(flavor database.WoWFlavor) *identifier.Identifier {
		return identifier.NewIdentifier(m)
	}
}

func AllScarletMonestery(fl database.WoWFlavor) *identifier.Identifier {
	all := []map[uint32]identifier.Identity{SMGraveyardHostiles(), SMLibraryHostiles(), SMArmoryHostiles(), CathedralHostiles()}
	if fl.Has(database.FlavorVanillaPlus) {
		all = append(all, VanillaPlusSMRaidHostiles())
	}

	merged := make(map[uint32]identifier.Identity)
	for _, mm := range all {
		for k, v := range mm {
			merged[k] = v
		}
	}

	return identifier.NewIdentifier(merged)
}

func CathedralHostiles() map[uint32]identifier.Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4540: "Scarlet Monk",
		4299: "Scarlet Chaplain",
		4301: "Scarlet Centurion",
		4302: "Scarlet Champion",
		4300: "Scarlet Wizard",

		4295: "Scarlet Myrmidon",

		4298: "Scarlet Defender", // Is this in the instance?
	})
	LoadBosses(hostile, map[uint32]string{
		3976: "Scarlet Commander Mograine",
		3977: "High Inquisitor Whitemane",
		4542: "High Inquisitor Fairbanks",
	})

	return hostile
}

func SMGraveyardHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4283: "Scarlet Sentry",
		4306: "Scarlet Torturer",
		4308: "Unfettered Spirit",
		6427: "Haunting Phantasm",
	})
	LoadBosses(hostile, map[uint32]string{
		3983: "Interrogator Vishas",
		4543: "Bloodmage Thalnos",
	})

	return hostile
}

func SMLibraryHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4287: "Scarlet Gallant",
		4288: "Scarlet Beastmaster",
		4304: "Scarlet Tracking Hound",
		4296: "Scarlet Adept",
		4291: "Scarlet Diviner",
		4540: "Scarlet Monk",
		4299: "Scarlet Chaplain",
	})
	LoadBosses(hostile, map[uint32]string{
		3974:  "Houndmaster Loksey",
		6487:  "Arcanist Doan",
		61983: "Brother Wystan", // TWoW
	})

	return hostile
}

func SMArmoryHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4298: "Scarlet Defender",
		4297: "Scarlet Conjuror",
		4289: "Scarlet Evoker",
		4290: "Scarlet Guardsman",
		4295: "Scarlet Myrmidon",
		4292: "Scarlet Protector",
		4286: "Scarlet Soldier",
	})
	LoadBosses(hostile, map[uint32]string{
		3975: "Herod",
	})

	return hostile
}

func VanillaPlusSMRaidHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		25245: "Soul Hunter",
		25246: "Soul",
		// TODO: Are these critters or a mechanic?
		25255: "Cockroach",

		//25200: "Fire Elemental",
		25201: "Scarlet Beastmaster",
		25202: "Scarlet Tracking Hound",
		25203: "Scarlet Soldier",
		25204: "Scarlet Evoker",
		25205: "Scarlet Guardsman",
		25206: "Scarlet Diviner",
		25207: "Scarlet Protector",
		25208: "Scarlet Sorcerer",
		25209: "Scarlet Myrmidon",
		25210: "Scarlet Adept",
		25211: "Scarlet Conjuror",
		25212: "Scarlet Defender",
		25213: "Scarlet Chaplain",
		25214: "Scarlet Wizard",
		25215: "Scarlet Centurion",
		25216: "Scarlet Champion",
		25217: "Scarlet Abbot",
		25218: "Scarlet Gallant",
		25219: "Scarlet Torturer",
		25220: "Scarlet Monk",
		25230: "Scarlet Sharpshooter",
		25231: "Vorrel Sengutz",
		25233: "Scarlet Sharpshooter",
		25234: "Scarlet Recruit",
		25235: "Scarlet Charger",
		25237: "Scarlet Charger",
		25257: "Scarlet Trainee",
	})
	LoadBosses(hostile, map[uint32]string{
		//25259: "Loksey", // TODO: Where did this unit entry come from?
		25221: "Brother Michael",
		25229: "Brigitte Abbendis",
		25222: "Fairbanks",
		25243: "Beltheris",
		25223: "Doan",
		25224: "Vishas",
		25225: "Loksey",
		25226: "Herod",
		25228: "Mograine & Whitemane", // "Sally Whitemane",
		25227: "Mograine & Whitemane", // "Renault Mograine",
	})

	return hostile
}

func BlackrockSpireHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		9262:  "Firebrand Invoker",          // 10 times
		9583:  "Bloodaxe Veteran",           // 11 times
		9257:  "Scarshield Warlock",         // 2 times
		9098:  "Scarshield Spellbinder",     // 2 times
		9201:  "Spirestone Ogre Magus",      // 4 times
		9200:  "Spirestone Reaver",          // 3 times
		9268:  "Smolderthorn Berserker",     // 8 times
		9266:  "Smolderthorn Witch Doctor",  // 3 times
		9260:  "Firebrand Legionnaire",      // 4 times
		9259:  "Firebrand Grunt",            // 23 times
		9097:  "Scarshield Legionnaire",     // 4 times
		9198:  "Spirestone Mystic",          // 3 times
		9267:  "Smolderthorn Axe Thrower",   // 6 times
		10375: "Spire Spiderling",           // 44 times
		9717:  "Bloodaxe Summoner",          // 2 times
		9199:  "Spirestone Enforcer",        // 3 times
		9197:  "Spirestone Battle Mage",     // 3 times
		9265:  "Smolderthorn Shadow Hunter", // 3 times
		9236:  "Shadow Hunter Vosh'gajin",   // 1 times
		10218: "Superior Healing Ward",      // 3 times
		9716:  "Bloodaxe Warmonger",         // 5 times
		9416:  "Scarshield Worg",            // 2 times
		9269:  "Smolderthorn Seer",          // 11 times
		9240:  "Smolderthorn Shadow Priest", // 13 times
		9261:  "Firebrand Darkweaver",       // 12 times
		9264:  "Firebrand Pyromancer",       // 4 times
		9696:  "Bloodaxe Worg",              // 10 times
		9216:  "Spirestone Warlord",         // 8 times
		9239:  "Smolderthorn Mystic",        // 6 times
		9263:  "Firebrand Dreadweaver",      // 5 times
		10374: "Spire Spider",               // 7 times
		9258:  "Scarshield Raider",          // 1 times
		9692:  "Bloodaxe Raider",            // 5 times
		9693:  "Bloodaxe Evoker",            // 7 times
		9241:  "Smolderthorn Headhunter",    // 5 times
		10161: "Rookery Whelp",
		10742: "Blackhand Dragon Handler",
		9096:  "Rage Talon Dragonspawn",
		9817:  "Blackhand Dreadweaver",
		10442: "Chromatic Whelp",
		10318: "Blackhand Assassin",
		10814: "Chromatic Elite Guard",
		9818:  "Blackhand Summoner",
		10680: "Summoned Blackhand Dreadweaver",
		10681: "Summoned Blackhand Veteran",
		10447: "Chromatic Dragonspawn",
		10366: "Rage Talon Dragon Guard",
		10371: "Rage Talon Captain",
		10316: "Blackhand Incarcerator",
		10083: "Rage Talon Flamescale",
		10317: "Blackhand Elite",
		10372: "Rage Talon Fire Tongue",
		10319: "Blackhand Iron Guard",
		9819:  "Blackhand Veteran",
		9708:  "Burning Imp",
		9701:  "Spire Scorpid",
		9045:  "Scarshield Acolyte",
		10261: "Burning Felhound",
		10221: "Bloodaxe Worg Pup",
		10683: "Rookery Hatcher",
		10258: "Rookery Guardian",
		10762: "Blackhand Thug",
		16066: "Spectral Assassin",
	})

	LoadBosses(hostile, map[uint32]string{
		9816:  "Pyroguard Emberseer",
		10430: "The Beast",
		10429: "Warchief Rend Blackhand",
		10339: "Warchief Rend Blackhand", // "Gyth" -- Blackhand mount
		10363: "General Drakkisath",
		10264: "Solakar Flamewreath",
		10899: "Goraluk Anvilcrack",
		16042: "Lord Valthalak",

		9568:  "Overlord Wyrmthalak",    // 1 times
		9196:  "Highlord Omokk",         // 1 times
		9218:  "Spirestone Battle Lord", // 1 times
		9237:  "War Master Voone",       // 1 times
		9219:  "Spirestone Butcher",     // 1 times
		10596: "Mother Smolderweb",      // 1 times
		10220: "Halycon",
		9736:  "Quartermaster Zigris",
		10268: "Gizrul the Slavener",
		10299: "Vaelan",
		10509: "Jed Runewatcher",
	})

	return hostile
}

func MoltenCoreHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		52150: "Shadowforge Guardian",
		57643: "Image of Sorcerer-Thane Thaurissan",
		12101: "Lava Surger",
		12100: "Lava Reaver",
		11672: "Core Rager",
		11663: "Flamewaker Healer",
		11658: "Molten Giant",
		52152: "Shadowforge Blazeweaver",
		11666: "Firewalker",
		11665: "Lava Annihilator",
		11659: "Molten Destroyer",
		12265: "Lava Spawn",
		11662: "Flamewaker Priest",
		11667: "Flameguard",
		11664: "Flamewaker Elite",
		12099: "Firesworn",
		12076: "Lava Elemental",
		12143: "Son of Flame",
		52151: "Shadowforge Hierophant",
		11668: "Firelord",
		11673: "Ancient Core Hound",
		11669: "Flame Imp",
		52147: "Large Incendic Egg",
		11671: "Core Hound",
		12119: "Flamewaker Protector",
		11661: "Flamewaker",

		// What the heck are these?
		52146: "Small Incendic Egg",
		52149: "Flameskin Incendosaur",
		52148: "Spawn of Incindis",
	})
	LoadBosses(hostile, map[uint32]string{
		12264: "Shazzrah",
		12118: "Lucifron",
		11982: "Magmadar",
		11502: "Ragnaros",
		12056: "Baron Geddon",
		12018: "Majordomo Executus",
		12057: "Garr",
		11988: "Golemagg the Incinerator",

		12098: "Sulfuron Harbinger",
		12259: "Gehennas",

		// TWoW
		// Basalthar & Smoldaris are a duo
		65020: "Basalthar & Smoldaris",
		65021: "Basalthar & Smoldaris",
		57642: "Sorcerer-Thane Thaurissan",
		52145: "Incindis",
	})

	return hostile
}

func TowerOfKarazhanHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		61937: "Shadowclaw Worgen",
		59997: "Red Owl",
		61956: "Lingering Astrologist",
		59969: "Ghastly Horseman",
		61942: "Manascale Dragon Guard",
		60062: "Lingering Doom",
		61934: "Spectral Worker",
		59988: "Manascale Whelp",
		59955: "Manascale Whelp",
		62604: "Desolate Invader",
		61950: "Arcane Anomaly",
		61940: "Manascale Drake",
		59989: "Manascale Ley-Seeker",
		61953: "Karazhan Protector Golem",
		61957: "Lingering Enchanter",
		59968: "Knight",
		61933: "Greater Gloomwing",
		61943: "Manascale Suppressor",
		60061: "Resonating Crystal",
		61954: "Lingering Magus",
		59995: "Unstoppable Infernal",
		49014: "Malfunctioning Knight",
		49015: "Withering Pawn",
		62607: "Forgotten Echo",
		62605: "Desolate Destroyer",
		62606: "Ima'ghaol, Herald of Desolation",
		61935: "Duskfang Creeper",
		59953: "Queen",
		59972: "Pawn",
		61945: "Manascale Overseer",
		61947: "Arcane Overflow",
		61955: "Lingering Arcanist",
		59971: "Bishop",
		59984: "Blue Affinity",
		62603: "Miniature Arcane Wyrm",
		61952: "Crumbling Protector",
		49013: "Decaying Bishop",
		61932: "Vampiric Gloomwing",
		59999: "Blood Raven",
		61949: "Disrupted Arcane Elemental",
		49012: "Broken Rook",
		61936: "Shadowclaw Darkbringer",
		61944: "Manascale Mageweaver",
		61948: "Unstable Arcane Elemental",
		61938: "Shadowclaw Rager",
		59985: "Green Affinity",
		59998: "Blue Owl",
		59970: "Rook",

		// Lower
		61194: "Shadowbane Ragefang",
		61208: "Skitterweb Venomfang",
		61211: "Shadowbane Glutton",
		14881: "Spider",
		61209: "Skitterweb Leaper",
		61207: "Skitterweb Darkfang",
		61210: "Phantom Cook",
		61203: "Dark Rider Apprentice",
		61197: "Grellkin Channeler",
		61196: "Grellkin Primalist",
		61206: "Skitterweb Crawler",
		30008: "Skitterweb Egg",
		61199: "Shattercage Magiskull",
		61202: "Haunted Blacksmith",
		61204: "Dark Rider Champion",
		61198: "Shattercage Spearman",
		61192: "Shadowbane Darkcaster",
		61191: "Shadowbane Alpha",
		61195: "Grellkin Shadow Weaver",
		61200: "Phantom Guardsman",
		61205: "Phantom Servant",
		61193: "Shadowbane Ambusher",

		// Rock of desolation
		62019: "Warbringer Overseer",
		62018: "Darkflame Imp",
		59957: "Fragment of Rupturan",
		59901: "Felheart",
		59990: "Nether Infernal",
		93335: "Nightmare Crawler",
		62020: "Outcast Souleater",
		59960: "Crumbling Exile",
		62022: "Draenei Worshipper",
		62021: "Draenei Darkbinder",
		62016: "Doomguard Annihilator",
		62015: "Dreadlord Doomseeker",
		62017: "Infernal Destroyer",
		62024: "Starving Draenei",
		59978: "Draenei Netherwalker",
		59958: "Living Fragment",
		62025: "Draenei Waterseeker",
		59980: "Draenei Truthseeker",
		59959: "Living Stone",
		93336: "Hellfire Doomguard",
		59975: "Rift-Lost Draenei",
		59977: "Draenei Riftwalker",
		59976: "Draenei Riftstalker",
		93338: "Hellfury Shard",
		93334: "Demonic Eye",
		93332: "Desolate Doomguard",
		59979: "Shadow-Lost Draenei",
		93337: "Hellfire Imp",
	})
	LoadBosses(hostile, map[uint32]string{
		61939: "Keeper Gnarlmoon",
		61951: "Anomalus",
		61958: "Echo of Medivh",
		59967: "King",

		// Rock of desolation
		59981: "Sanv Tas'dal",
		59991: "Kruul",
		59961: "Rupturan the Broken",
		93333: "Mephistroth",
		61946: "Ley-Watcher Incantagos",

		// Lower
		61221: "Brood Queen Araxxna",
		61224: "Grizikil",
		61223: "Clawlord Howlfang",
		61222: "Lord Blackwald II",
		61225: "Moroes",
	})

	kingAds := func(f encounter.Fight) *identifier.EncounterFuncResult {
		return &identifier.EncounterFuncResult{
			EncounterName: "King",
			Bosses:        []uint32{59967},
		}
	}
	setKing := func(entry uint32) {
		id := hostile[entry]
		id.EncounterNameFn = kingAds
		hostile[entry] = id
	}

	setKing(59953)
	setKing(59972)
	setKing(59970)
	setKing(59971)
	setKing(59968)

	return hostile
}

func OnyxiaHostiles(fl database.WoWFlavor) *identifier.Identifier {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		12129: "Onyxian Warder",
		11262: "Onyxian Whelp",

		50143: "Cindarion",
		49016: "Onyxian Inciter",
		40068: "Onyxian Warder",
		49017: "Onyxian Flamespawn",
		50144: "Onyxian Hatcher",
	})
	LoadBosses(hostile, map[uint32]string{
		10184: "Onyxia",
	})

	if fl.Has(database.FlavorNightmareOfUrsol) {
		LoadBosses(hostile, map[uint32]string{
			49018: "Broodcommander Axelus",
		})
	}

	if fl.Has(database.FlavorAzerothcoreProgression) {
		LoadAdds(hostile, map[uint32]string{
			301001: "Onyxian Whelp",
			301002: "Onyxian Warder",
		})
		LoadBosses(hostile, map[uint32]string{
			301000: "Onyxia",
		})
	}

	if fl.Has(database.FlavorEpoch) {
		LoadAdds(hostile, map[uint32]string{
			45237:  "Onyxian Flameweaver",
			45238:  "Onyxian Honorguard",
			12129:  "Onyxian Warder",
			300057: "Living Dragonfire",

			45131: "Evorian",
			45132: "Efevian",
			45129: "Omevian",
			45127: "Adession",
			45128: "Hazerion",
			45130: "Vatryrion",
		})
		LoadBosses(hostile, map[uint32]string{
			45136: "Ortorg the Ardent",
			45125: "Atressian",
			45133: "Onyxia",
		})
	}

	return identifier.NewIdentifier(hostile)
}

func RagefireChasmHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		11323: "Searing Blade Enforcer",
		11322: "Searing Blade Cultist",
		11320: "Earthborer",
		11318: "Ragefire Trogg",
		11321: "Molten Elemental",
		11319: "Ragefire Shaman",
		11324: "Searing Blade Warlock",
	})

	LoadBosses(hostile, map[uint32]string{
		11520: "Taragaman the Hungerer",
		11518: "Jergosh the Invoker",
		11517: "Oggleflint",
		11519: "Bazzalan",
	})
	return hostile
}

func ZulGurubHostiles(fl database.WoWFlavor) *identifier.Identifier {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		11352: "Gurubashi Berserker",
		11391: "Vilebranch Speaker",
		14881: "Spider",
		11350: "Gurubashi Axe Thrower",
		11370: "Razzashi Broodwidow",
		15010: "Jungle Toad",
		14826: "Sacrificed Troll",
		11360: "Zulian Cub",
		14750: "Gurubashi Bat Rider",
		11355: "Gurubashi Warrior",
		11361: "Zulian Tiger",
		11368: "Bloodseeker Bat",
		11357: "Son of Hakkar",
		14825: "Withered Mistress",
		11388: "Witherbark Speaker",
		15041: "Spawn of Mar'li",
		11339: "Hakkari Shadow Hunter",
		14880: "Razzashi Skitterer",
		11340: "Hakkari Blood Priest",
		11356: "Gurubashi Champion",
		11351: "Gurubashi Headhunter",
		14883: "Voodoo Slave",
		11374: "Hooktooth Frenzy",
		14821: "Razzashi Raptor",
		14882: "Atal'ai Mistress",
		14532: "Razzashi Venombrood",
		14884: "Parasitic Serpent",
		14987: "Powerful Healing Ward",
		15101: "Zulian Prowler",
		15043: "Zulian Crocolisk",
		15067: "Zulian Stalker",
		11387: "Sandfury Speaker",
		11830: "Hakkari Priest",
		11353: "Gurubashi Blood Drinker",
		11338: "Hakkari Shadowcaster",
		11372: "Razzashi Adder",
		11373: "Razzashi Cobra",
		11371: "Razzashi Serpent",
		11365: "Zulian Panther",
		11359: "Soulflayer",
		11831: "Hakkari Witch Doctor",
		15068: "Zulian Guardian",
		15009: "Voodoo Spirit",
		14965: "Bloodseeker Batrider",
		11390: "Skullsplitter Speaker",
		11389: "Bloodscalp Speaker",
		15117: "Chained Spirit",
	})

	LoadBosses(hostile, map[uint32]string{
		11348: "High Priest Thekal", // "Zealot Zath"
		11347: "High Priest Thekal", // "Zealot Lor'Khan"
		// Idk why, but TWoW has the first entry ID.
		// V+ has the second.
		14599: "High Priest Thekal",
		14509: "High Priest Thekal",

		14507: "High Priest Venoxis",

		14988: "Bloodlord Mandokir", // "Ohgan", the mount
		11382: "Bloodlord Mandokir",

		14510: "High Priestess Mar'li",
		14517: "High Priestess Jeklik",
		14515: "High Priestess Arlokk",
		11380: "Jin'do the Hexxer",
		15114: "Gahz'ranka",
		14834: "Hakkar",

		// Edge of Madness
		15083: "Hazza'rah",
		15084: "Renataki",
		15085: "Wushoolay",
		15082: "Gri'lek",
	})

	if fl.Has(database.FlavorVanillaPlus) {
		LoadAdds(hostile, map[uint32]string{
			15111: "Mad Servant",
			15146: "Mad Voidwalker",
			25040: "Caverngloom Crocolisk",
		})
		LoadBosses(hostile, map[uint32]string{
			25031: "Azus the Bloodseeker",
			25030: "The Nameless Hermit",
		})
	}

	return identifier.NewIdentifier(hostile)
}

func RazorfenKraulHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4532:  "Razorfen Beastmaster",
		4531:  "Razorfen Beast Trainer",
		4515:  "Death's Head Acolyte",
		4514:  "Raging Agam'ar",
		4541:  "Blood of Agamaggan",
		4511:  "Agam'ar",
		4512:  "Rotting Agam'ar",
		4442:  "Razorfen Defender",
		4436:  "Razorfen Quilguard",
		4516:  "Death's Head Adept",
		4538:  "Kraul Bat",
		4522:  "Razorfen Dustweaver",
		4530:  "Razorfen Handler",
		6035:  "Razorfen Stalker",
		4625:  "Death's Head Ward Keeper",
		4517:  "Death's Head Priest",
		4520:  "Razorfen Geomancer",
		4523:  "Razorfen Groundshaker",
		62501: "Bramblehide Rootshaper",
		4437:  "Razorfen Warden",
		4427:  "Ward Guardian",
		4623:  "Quilguard Champion",
		4440:  "Razorfen Totemic",
		4539:  "Greater Kraul Bat",
		4519:  "Death's Head Seer",
		4435:  "Razorfen Warrior",
		4525:  "Razorfen Earthbreaker",
		4518:  "Death's Head Sage",
		62502: "Gnarled Bramblehide",
	})
	LoadBosses(hostile, map[uint32]string{
		4424:  "Aggem Thorncurse",
		4428:  "Death Speaker Jargba",
		4420:  "Overlord Ramtusk",
		4438:  "Razorfen Spearhide",
		4422:  "Agathelos the Raging",
		4425:  "Blind Hunter",
		4421:  "Charlga Razorflank",
		4842:  "Earthcaller Halmgar",
		62503: "Rotthorn",
	})

	return hostile
}

func WailingCavernsHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		3678:  "Disciple of Naralex",
		5055:  "Deviate Lasher",
		61966: "Kolkar Truthseeker",
		3641:  "Deviate Lurker",
		3640:  "Evolving Ectoplasm",
		5756:  "Deviate Venomwing",
		3637:  "Deviate Guardian",
		61967: "Kolkar Explorer",
		5755:  "Deviate Viper",
		8886:  "Deviate Python",
		5056:  "Deviate Dreadfang",
		5762:  "Deviate Moccasin",
		3636:  "Deviate Ravager",
		5053:  "Deviate Crocolisk",
		5761:  "Deviate Shambler",
		5048:  "Deviate Adder",
		5763:  "Nightmare Ectoplasm",
		3840:  "Druid of the Fang",
		61964: "Unnatural Overgrowth",
	})

	LoadBosses(hostile, map[uint32]string{
		3671:  "Lady Anacondra",
		3669:  "Lord Cobrahn",
		3653:  "Kresh",
		3674:  "Skum",
		61968: "Zandara Windhoof",
		3670:  "Lord Pythas",
		61965: "Vangros",
		3673:  "Lord Serpentis",
		5775:  "Verdan the Everliving",
		3654:  "Mutanus the Devourer",
		5912:  "Deviate Faerie Dragon",
	})
	return hostile
}

func WindhornCanyonHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		62762: "Venomous Cloudstalker",  // 15 times
		62774: "Deathtotem Bonespeaker", // 10 times
		62773: "Deathtotem Shaman",      // 7 times
		10183: "Moonflare Totem",        // 7 times
		62765: "Blackwind Geologist",    // 10 times
		62766: "Blackwind Overseer",     // 8 times
		62866: "Storm Residue",          // 21 times
		62763: "Storm Elemental",        // 13 times
		62759: "Blackwind Trapper",      // 12 times
		62760: "Blackwind Villager",     // 51 times
		62767: "Blackwind Warrior",      // 15 times
		62772: "Blackwind Totemkeeper",  // 19 times
		62769: "Blackwind Watcher",      // 4 times
		62761: "Rocktail Scorpid",       // 25 times
		62771: "Blackwind Bloodguard",   // 3 times
		62768: "Blackwind Elder",        // 9 times
		62865: "Storm Guardian",         // 7 times
		62770: "Blackwind Earthkeeper",  // 6 times
		62764: "Blackwind Hunter",       // 11 times
		62985: "Deathtotem Behemoth",    // 7 times
		62777: "Deathtotem Avenger",     // 11 times
	})

	LoadBosses(hostile, map[uint32]string{
		62785: "Champion Rotag",            // 1 times
		62782: "Chieftain Shalk Blackwind", // 1 times
		62779: "Pathun Duskhide",           // 1 times
		62757: "Blackwind Brute",           // 1 times
		62784: "Walgan Bloodcaller",        // 1 times
		62783: "Ambassador Vortalus",       // 1 times
		62781: "Prophet Stormhoof",         // 1 times
		62778: "Ahgk'tos the Pure",         // 1 times
		61410: "Bonespeaker Narlgom",       // "Spirit of Champion Rotag",  // 1 times
		62780: "Bonespeaker Narlgom",       // 1 times
	})

	return hostile
}

func DeadminesHostiles(fl database.WoWFlavor) *identifier.Identifier {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		61959: "Defias Chemist",
		641:   "Goblin Woodcarver",
		1731:  "Goblin Craftsman",
		1732:  "Defias Squallshaper",
		3947:  "Goblin Shipbuilder",
		636:   "Defias Blackguard",
		598:   "Defias Miner",
		4418:  "Defias Wizard",
		622:   "Goblin Engineer",
		657:   "Defias Pirate",
		1729:  "Defias Evoker",
		122:   "Defias Highwayman",
		1726:  "Defias Magician",
		61960: "Defias Mixologist",
		4416:  "Defias Strip Miner",
		1725:  "Defias Watchman",
		4417:  "Defias Taskmaster",
		634:   "Defias Overseer",
	})

	LoadBosses(hostile, map[uint32]string{
		61961: "Jared Voss",
		645:   "Cookie",
		646:   "Mr. Smite",
		643:   "Sneed",
		639:   "Edwin VanCleef",
		647:   "Captain Greenskin",
		644:   "Rhahk'Zor",
		1763:  "Gilnid",
		3586:  "Miner Johnson",
	})

	hostile[642] = Identity{Name: "Sneed's Shredder", Affiliation: types.AffiliationHostile, EncounterName: "Sneed", Boss: true}

	if fl.Has(database.FlavorNightmareOfUrsol) {
		LoadAdds(hostile, map[uint32]string{
			61962:  "Manufactured Golem",
			912408: "Burning Blade Flamekin",
		})
		LoadBosses(hostile, map[uint32]string{
			61963: "Masterpiece Harvester",
		})
	}

	return identifier.NewIdentifier(hostile)
}

func ShadowfangKeepHostiles(fl database.WoWFlavor) *identifier.Identifier {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		3851:  "Shadowfang Whitescalp",
		3853:  "Shadowfang Moonwalker",
		3854:  "Shadowfang Wolfguard",
		3855:  "Shadowfang Darksoul",
		3857:  "Shadowfang Glutton",
		3861:  "Bleak Worg",
		3862:  "Slavering Worg",
		3864:  "Fel Steed",
		3865:  "Shadow Charger",
		3866:  "Vile Bat",
		3868:  "Blood Seeker",
		3872:  "Deathsworn Captain",
		3875:  "Haunted Servitor",
		3877:  "Wailing Guardsman",
		4958:  "Haunting Spirit",
		14682: "Sever",
	})

	// Non-combat and friendly units are registered so they do not appear in the
	// unknown-unit report or participate in encounter detection.
	hostile[2110] = Identity{Name: "Black Rat", Affiliation: types.AffiliationUnknown}
	hostile[3850] = Identity{Name: "Sorcerer Ashcrombe", Affiliation: types.AffiliationFriendly}
	hostile[10000] = Identity{Name: "Arugal", Affiliation: types.AffiliationUnknown}

	LoadBosses(hostile, map[uint32]string{
		3886: "Razorclaw the Butcher",
		3887: "Baron Silverlaine",
		3914: "Rethilgore",
		3927: "Wolf Master Nandos",
		4274: "Fenrus the Devourer",
		4275: "Archmage Arugal",
		4278: "Commander Springvale",
		4279: "Odo the Blindwatcher",
	})

	if fl.Has(database.FlavorNightmareOfUrsol) {
		LoadAdds(hostile, map[uint32]string{
			61969:  "Prelate Ironmane",
			61970:  "Spectral Cleric",
			912408: "Burning Blade Flamekin",
		})
	}

	return identifier.NewIdentifier(hostile)
}

func EmeraldSanctumHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		60744: "Sanctum Wyrm",
		60742: "Sanctum Dreamer",
		60746: "Sanctum Scalebane",
		61212: "Sanctum Supressor",
		60743: "Sanctum Dragonkin",
		60745: "Sanctum Wyrmkin",
	})
	LoadBosses(hostile, map[uint32]string{
		60747: "Erennius",
		60748: "Solnius",
	})

	hardMode := func(f encounter.Fight) *identifier.EncounterFuncResult {
		hasErennius := false
		hasSolnius := false
		for _, host := range f.Hostiles {
			entry, _ := host.ID.GetEntry()
			if entry == 60747 {
				hasErennius = true
			}
			if entry == 60748 {
				hasSolnius = true
			}
		}
		if hasErennius && hasSolnius {
			return &identifier.EncounterFuncResult{
				EncounterName: "Solnius (Hard Mode)",
			}
		}
		return nil
	}
	hostile[60747] = Identity{Affiliation: types.AffiliationHostile, Name: "Erennius", Boss: true, EncounterNameFn: hardMode}
	hostile[60748] = Identity{Affiliation: types.AffiliationHostile, Name: "Solnius", Boss: true, EncounterNameFn: hardMode}

	return hostile
}

func BlackrockDepthsHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		8890: "Anvilrage Warden",
		8891: "Anvilrage Guardsman",
		8895: "Anvilrage Officer",
		8893: "Anvilrage Soldier",
		8910: "Blazing Fireguard",
		8921: "Bloodhound",
		8912: "Twilight's Hammer Torturer",
		8894: "Anvilrage Medic",
		8889: "Anvilrage Overseer",
		8892: "Anvilrage Footman",
		8916: "Arena Spectator",

		8896:  "Shadowforge Peasant",
		8897:  "Doomforge Craftsman",
		8898:  "Anvilrage Marshal",
		8899:  "Doomforge Dragoon",
		8900:  "Doomforge Arcanasmith",
		8901:  "Anvilrage Reservist",
		8902:  "Shadowforge Citizen",
		8903:  "Anvilrage Captain",
		8904:  "Shadowforge Senator",
		8905:  "Warbringer Construct",
		8906:  "Ragereaver Golem",
		8907:  "Wrath Hammer Construct",
		8908:  "Molten War Golem",
		8909:  "Fireguard",
		8911:  "Fireguard Destroyer",
		8913:  "Twilight Emissary",
		8914:  "Twilight Bodyguard",
		8915:  "Twilight's Hammer Ambassador",
		8920:  "Weapon Technician",
		8922:  "Bloodhound Mastiff",
		8982:  "Ironhand Guardian",
		9020:  "Commander Gor'shak",
		9021:  "Kharan Mighthammer",
		9022:  "Dughal Stormwing",
		9023:  "Marshal Windsor",
		9034:  "Hate'rel",
		9036:  "Vile'rel",
		9038:  "Seeth'rel",
		9040:  "Dope'rel",
		9042:  "Verek",
		9500:  "Mistress Nagmara",
		9503:  "Private Rocknot",
		9541:  "Blackbreath Crony",
		9545:  "Grim Patron",
		9547:  "Guzzling Patron",
		9554:  "Hammered Patron",
		9677:  "Ograbisi",
		9678:  "Shill Dinger",
		9679:  "Tobias Seecher",
		9680:  "Crest Killer",
		9681:  "Jaz",
		9956:  "Shadowforge Flame Keeper",
		10043: "Ribbly's Crony",
		10116: "Slave",
		10117: "Tortured Slave",
		15549: "Elder Morndeep",
		16079: "Theldren Trigger",
		23872: "Coren Direbrew",
		28067: "Dark Iron Brewer",
	})
	LoadBosses(hostile, map[uint32]string{
		9016: "Bael'Gar",
		9018: "High Interrogator Gerstahn",

		8929: "Princess Moira Bronzebeard",
		8983: "Golem Lord Argelmach",
		9017: "Lord Incendius",
		9019: "Emperor Dagran Thaurissan",
		9024: "Pyromancer Loregrain",
		9025: "Lord Roccor",
		9033: "General Angerforge",
		9035: "Anger'rel",
		9037: "Gloom'rel",
		9039: "Doom'rel",
		9041: "Warder Stilgiss",
		9056: "Fineous Darkvire",
		9156: "Ambassador Flamelash",
		9319: "Houndmaster Grebmar",
		9499: "Plugger Spazzring",
		9502: "Phalanx",
		9537: "Hurley Blackbreath",
		9543: "Ribbly Screwspigot",
		9938: "Magmus",
	})

	return hostile
}

// AQ40
func TempleOfAhnQirajHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		15262: "Obsidian Eradicator",
		15621: "Yauj Brood",
		15250: "Qiraji Slayer",
		15910: "Giant Tentacle Portal",
		15802: "Flesh Tentacle",
		15300: "Vekniss Drone",
		15246: "Qiraji Mindslayer",
		15247: "Qiraji Brainwasher",
		15984: "Sartura's Royal Guard",
		15252: "Qiraji Champion",
		15264: "Anubisath Sentinel",
		15230: "Vekniss Warrior",
		15229: "Vekniss Soldier",
		15236: "Vekniss Wasp",
		15277: "Anubisath Defender",
		15538: "Anubisath Swarmguard",
		15317: "Qiraji Scorpion",
		15235: "Vekniss Stinger",
		15312: "Obsidian Nullifier",
		15726: "Eye Tentacle",
		15728: "Giant Claw Tentacle",
		15233: "Vekniss Guardian",
		15667: "Glob of Viscidus",
		15311: "Anubisath Warder",
		15725: "Claw Tentacle",
		15622: "Vekniss Borer",
		15962: "Vekniss Hatchling",
		15630: "Spawn of Fankriss",
		15240: "Vekniss Hive Crawler",
		15249: "Qiraji Lasher",
		15537: "Anubisath Warrior",
		15316: "Qiraji Scarab",
		15334: "Giant Eye Tentacle",
	})
	LoadBosses(hostile, map[uint32]string{
		15517: "Ouro",
		15957: "Ouro", // Ouro Spawner helper casts drive some AzerothCore logs.
		15510: "Fankriss the Unyielding",
		15516: "Battleguard Sartura",
		15299: "Viscidus",
		15509: "Princess Huhuran",
		15263: "The Prophet Skeram",

		15727: "C'Thun",
		15589: "C'Thun", // "Eye of C'Thun",

		// Twin emps
		15275: "Twin Emperors", // "Emperor Vek'nilash",
		15276: "Twin Emperors", //   "Emperor Vek'lor",

		// Bug family
		15543: "Bug Family", // "Princess Yauj",
		15511: "Bug Family", // "Lord Kri",
		15544: "Bug Family", // "Vem",
	})

	return hostile
}

// AQ20
func RuinsOfAhnQirajHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		15387: "Qiraji Warrior",
		15390: "Captain Xurrem",
		15338: "Obsidian Destroyer",
		15343: "Qiraji Swarmguard",
		15168: "Vile Scarab",
		15389: "Captain Drenn",
		15538: "Anubisath Swarmguard",
		15327: "Hive'Zara Stinger",
		15344: "Swarmguard Needler",
		15391: "Captain Qeez",
		15386: "Major Yeggeth",
		15514: "Buru Egg",
		15473: "Kaldorei Elite",
		15388: "Major Pakkon",
		15521: "Hive'Zara Hatchling",
		15555: "Hive'Zara Larva",
		15546: "Hive'Zara Swarmer",
		15471: "Lieutenant General Andorov",
		15392: "Captain Tuubid",
		15385: "Colonel Zerran",
		15335: "Flesh Hunter",
		15537: "Anubisath Warrior",
		15323: "Hive'Zara Sandstalker",
		15333: "Silicate Feeder",
		15428: "Sand Vortex",
		15324: "Qiraji Gladiator",
		15325: "Hive'Zara Wasp",
		15355: "Anubisath Guardian",
		15320: "Hive'Zara Soldier",
	})

	LoadBosses(hostile, map[uint32]string{
		15348: "Kurinnaxx",
		15341: "General Rajaxx",
		15339: "Ossirian the Unscarred",
		15370: "Buru the Gorger",
		15340: "Moam",
		15369: "Ayamiss the Hunter",
	})
	return hostile
}

func ScholomanceHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)

	LoadAdds(hostile, map[uint32]string{
		11582: "Scholomance Dark Summoner",
		10482: "Risen Lackey",
		10678: "Plagued Hatchling",
		14521: "Aspect of Shadow",
		30000: "Risen Guard",
		11257: "Scholomance Handler",
		10486: "Risen Warrior",
		10477: "Scholomance Necromancer",
		14518: "Aspect of Banality",
		14512: "Corrupted Spirit",
		14519: "Aspect of Corruption",
		14516: "Death Knight Darkreaver",
		10500: "Spectral Teacher",
		14514: "Banal Spirit",
		14511: "Shadowed Spirit",
		10491: "Risen Bonewarder",
		10499: "Spectral Researcher",
		11258: "Frail Skeleton",
		10487: "Risen Protector",
		10469: "Scholomance Adept",
		10485: "Risen Aberration",
		10480: "Unstable Corpse",
		10470: "Scholomance Neophyte",
		10471: "Scholomance Acolyte",
		10498: "Spectral Tutor",
		14520: "Aspect of Malice",
		10472: "Scholomance Occultist",
		10476: "Scholomance Necrolyte",
		10481: "Reanimated Corpse",
		10488: "Risen Construct",
		14513: "Malicious Spirit",
		10478: "Splintered Skeleton",
		10489: "Risen Guard",
		11551: "Necrofiend",
		10495: "Diseased Ghoul",
		11261: "Doctor Theolen Krastinov",
		11439: "Illusion of Jandice Barov",
	})
	LoadBosses(hostile, map[uint32]string{
		10506: "Kirtonos the Herald",
		11622: "Rattlegore",
		10508: "Ras Frostwhisper",
		10507: "The Ravenian",
		10901: "Lorekeeper Polkelt",
		10505: "Instructor Malicia",
		10502: "Lady Illucia Barov",
		10503: "Jandice Barov",
		10504: "Lord Alexei Barov",
		1853:  "Darkmaster Gandling",

		// Paladin mount boss
		14516: "Death Knight Darkreaver",
	})
	return hostile
}

func BlackwingLairHostiles(fl database.WoWFlavor) *identifier.Identifier {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		12464: "Death Talon Seether",
		12468: "Death Talon Hatcher",
		14022: "Corrupted Blue Whelp",
		12458: "Blackwing Taskmaster",
		12557: "Grethok the Controller",
		12420: "Blackwing Mage",
		14401: "Master Elemental Shaper Krixix",
		12416: "Blackwing Legionnaire",
		12422: "Death Talon Dragonspawn",
		12463: "Death Talon Flamescale",
		12461: "Death Talon Overseer",
		12457: "Blackwing Spellbinder",
		14456: "Blackwing Guardsman",
		12467: "Death Talon Captain",
		14101: "Enraged Felguard",
		14024: "Corrupted Bronze Whelp",
		12459: "Blackwing Warlock",
		12460: "Death Talon Wyrmguard",
		13996: "Blackwing Technician",
		14605: "Bone Construct",
		12465: "Death Talon Wyrmkin",
		14025: "Corrupted Green Whelp",
		14023: "Corrupted Green Whelp",
		14302: "Chromatic Drakonid",

		51233: "Blackwing Alchemist",
		50142: "Blackwing Marksman",
		52153: "Death Talon Scorcher",
		65151: "Shadowflame Spark",
		14261: "Blue Drakonid",
		14262: "Green Drakonid",
		14263: "Bronze Drakonid",
		14264: "Red Drakonid",
		14265: "Black Drakonid",

		14668: "Corrupted Infernal",
	})

	LoadBosses(hostile, map[uint32]string{
		11583: "Nefarian",
		12435: "Razorgore the Untamed",
		12017: "Broodlord Lashlayer",
		11983: "Firemaw",
		14020: "Chromaggus",
		13020: "Vaelastrasz the Corrupt",
		65148: "Ezzel Darkbrewer",
	})

	ebonrocAndFlamegor := func(f encounter.Fight) *identifier.EncounterFuncResult {
		hasEbonroc := false
		hasFlamegor := false
		for _, host := range f.Hostiles {
			entry, _ := host.ID.GetEntry()
			if entry == 11981 {
				hasFlamegor = true
			}
			if entry == 14601 {
				hasEbonroc = true
			}
		}
		if hasFlamegor && hasEbonroc {
			return &identifier.EncounterFuncResult{
				EncounterName: "Flamegor & Ebonroc",
			}
		}
		return nil
	}

	hostile[14601] = Identity{Affiliation: types.AffiliationHostile, Name: "Ebonroc", Boss: true, EncounterNameFn: ebonrocAndFlamegor}
	hostile[11981] = Identity{Affiliation: types.AffiliationHostile, Name: "Flamegor", Boss: true, EncounterNameFn: ebonrocAndFlamegor}

	if fl.Has(database.FlavorVanillaPlus) {
		delete(hostile, 13020) // "Vaelastrasz the Corrupt"
		delete(hostile, 14401) // "Master Elemental Shaper Krixix"
		hostile[25123] = Identity{
			Affiliation:   types.AffiliationHostile,
			Name:          "Vaelastrasz the Chained",
			EncounterName: "",
			Boss:          true,
		}
		hostile[25100] = Identity{
			Affiliation:   types.AffiliationHostile,
			Name:          "Elementium Decapitator Mk III",
			EncounterName: "",
			Boss:          true,
		}
		hostile[14401] = Identity{
			Affiliation:     types.AffiliationHostile,
			Name:            "Master Elemental Shaper Krixix",
			EncounterName:   "",
			Boss:            true,
			EncounterNameFn: nil,
		}
	}

	return identifier.NewIdentifier(hostile)
}

func NaxxramasHostiles(fl database.WoWFlavor) map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		16154: "Risen Deathknight",
		16803: "Deathknight Understudy",
		16125: "Unrelenting Deathknight",
		16290: "Fallout Slime",
		16158: "Death Touched Warrior",
		16164: "Shade of Naxxramas",
		15974: "Dread Creeper",
		14881: "Spider",
		15981: "Naxxramas Acolyte",
		16505: "Naxxramas Follower",
		16156: "Dark Touched Warrior",
		16486: "Web Wrap",
		16163: "Deathknight Cavalier",
		15979: "Tomb Horror",
		15977: "Infectious Skitterer",
		15975: "Carrion Spinner",
		16193: "Skeletal Smith",
		16017: "Patchwork Golem",
		16698: "Corpse Scarab",
		16067: "Skeletal Steed",
		16148: "Spectral Deathknight",
		16297: "Mutated Grub",
		15978: "Crypt Reaver",
		16216: "Unholy Swords",
		16150: "Spectral Rider",
		16427: "Soldier of the Frozen Wastes",
		16428: "Unstoppable Abomination",
		16441: "Guardian of Icecrown",
		15930: "Feugen",
		16126: "Unrelenting Rider",
		16149: "Spectral Horse",
		16984: "Plagued Warrior",
		16036: "Frenzied Bat",
		16037: "Plagued Bat",
		16286: "Spore",
		16194: "Unholy Axe",
		16034: "Plague Beast",
		16429: "Soul Weaver",
		16506: "Naxxramas Worshipper",
		16024: "Embalming Slime",
		16360: "Zombie Chow",
		16167: "Bony Construct",
		16157: "Doom Touched Warrior",
		16452: "Necro Knight Guardian",
		16068: "Larva",
		16446: "Plagued Gargoyle",
		16029: "Sludge Belcher",
		16215: "Unholy Staff",
		16020: "Mad Scientist",
		16451: "Deathknight Vindicator",
		16236: "Eye Stalk",
		16453: "Necro Stalker",
		16375: "Sewage Slime",
		16447: "Plagued Ghoul",
		16021: "Living Monstrosity",
		15929: "Stalagg",
		16018: "Bile Retcher",
		16025: "Stitched Spewer",
		16124: "Unrelenting Trainee",
		16127: "Spectral Trainee",
		16056: "Diseased Maggot",
		16449: "Spirit of Naxxramas",
		16165: "Necro Knight",
		15976: "Venom Stalker",
		17055: "Maexxna Spiderling",
		16145: "Deathknight Captain",
		15980: "Naxxramas Cultist",
		16861: "Death Lord",
		16146: "Deathknight",
		16573: "Crypt Guard",
		16368: "Necropolis Acolyte",
		16022: "Surgical Assistant",
	})

	LoadBosses(hostile, map[uint32]string{
		16028: "Patchwerk",
		15931: "Grobbulus",
		15932: "Gluth",
		15930: "Thaddius", // "Feugen"
		15929: "Thaddius", // "Stalagg"
		15928: "Thaddius",
		15956: "Anub'Rekhan",
		15953: "Grand Widow Faerlina",
		15952: "Maexxna",
		15954: "Noth the Plaguebringer",
		15936: "Heigan the Unclean",
		16011: "Loatheb",
		15990: "Kel'Thuzad",
		16061: "Instructor Razuvious",
		16060: "Gothik the Harvester",
		15989: "Sapphiron",

		16064: "Four Horsemen", // "Thane Korth'azz",
		16065: "Four Horsemen", // "Lady Blaumeux",
		16063: "Four Horsemen", // "Sir Zeliek",
		16062: "Four Horsemen", // "Highlord Mograine",
	})
	return hostile
}

func StratholmeHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		10408: "Rockwing Gargoyle",
		10412: "Crypt Crawler",
		10391: "Skeletal Berserker",
		10383: "Broken Cadaver",
		10399: "Thuzadin Acolyte",
		10407: "Fleshflayer Ghoul",
		10381: "Ravaged Cadaver",
		10464: "Wailing Banshee",
		10398: "Thuzadin Shadowcaster",
		11030: "Mindless Undead",
		10463: "Shrieking Banshee",
		10809: "Stonespine",
		10406: "Ghoul Ravener",
		10577: "Crypt Scarab",
		10400: "Thuzadin Necromancer",
		10435: "Magistrate Barthilas",
		10417: "Venom Belcher",
		10390: "Skeletal Guardian",
		10411: "Eye of Naxxramas",
		10405: "Plague Ghoul",
		10697: "Bile Slime",
		10876: "Undead Scarab",
		10416: "Bile Spewer",
		10394: "Black Guard Sentry",
		10382: "Mangled Cadaver",
		10413: "Crypt Beast",

		10384: "Spectral Citizen",
		10385: "Ghostly Citizen",
		10393: "Skul",
		10409: "Rockwing Screecher",
		10414: "Patchwork Horror",
		10415: "Ash'ari Crystal",
		10418: "Crimson Guardsman",
		10419: "Crimson Conjuror",
		10420: "Crimson Initiate",
		10421: "Crimson Defender",
		10422: "Crimson Sorcerer",
		10423: "Crimson Priest",
		10424: "Crimson Gallant",
		10425: "Crimson Battle Mage",
		10426: "Crimson Inquisitor",
		10917: "Aurius",
		11043: "Crimson Monk",
		11082: "Stratholme Courier",
		14646: "Stratholme Trigger",
		15607: "Elder Farwhisper",
		16031: "Ysida Harmon",
		16102: "Sothos",
		16101: "Jarien",
		11058: "Fras Siabi",
	})
	LoadBosses(hostile, map[uint32]string{
		10438: "Maleki the Pallid",
		10436: "Baroness Anastari",
		10440: "Baron Rivendare",
		10437: "Nerub'enkan",
		10439: "Ramstein the Gorger",

		10435: "Magistrate Barthilas",
		10516: "The Unforgiven",
		10558: "Hearthsinger Forresten",
		10808: "Timmy the Cruel",
		10811: "Archivist Galford",
		10997: "Cannon Master Willey",
		11032: "Malor the Zealous",
		10812: "Grand Crusader Dathrohan",
	})

	return hostile
}

func TheBlackMorassHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		65100: "Infinite Dragonspawn",
		65101: "Infinite Riftguard",
		65105: "Infinite Rift-Lord",
		65110: "Darkwater Python",
		65111: "Murkwater Crocolisk",
		65103: "Infinite Whelp",
		65102: "Infinite Riftweaver",
		50106: "Time Anomaly",
		61318: "Echo of Time",
		61317: "Temporal Dust",
		65118: "Echo of Kael'thas Sunstrider",
	})
	LoadBosses(hostile, map[uint32]string{
		65113: "Chronar",
		61575: "Epidamu",
		65125: "Antnormi",
		65122: "Rotmaw",
		65124: "Mossheart",
		65116: "Time-Lord Epochronos",
		61316: "Drifting Avatar of Sand",
	})

	return hostile
}

func DireMaulHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		// West
		11483: "Mana Remnant",
		11475: "Eldreth Phantasm",
		11471: "Eldreth Apparition",
		14400: "Arcane Feedback",
		11469: "Eldreth Seether",
		11476: "Skeletal Highborne",
		11484: "Residual Monstrosity",
		11466: "Highborne Summoner",
		11459: "Ironbark Protector",
		11473: "Eldreth Spectre",
		14398: "Eldreth Darter",
		14308: "Ferra",
		14396: "Eye of Immol'thar",
		11470: "Eldreth Sorcerer",
		11489: "Tendris Warpwood",
		14399: "Arcane Torrent",
		11472: "Eldreth Spirit",
		11477: "Rotting Highborne",
		14370: "Cadaverous Worm",

		// ??
		11441: "Gordok Brute",             // 18 times
		14385: "Doomguard Minion",         // 15 times
		14386: "Wandering Eye of Kilrogg", // 2 times
		11451: "Wildspawn Satyr",          // 6 times
		11445: "Gordok Captain",           // 6 times
		//11500: "[UNUSED] Majordomo Bagrosh", // 1 times
		11454: "Wildspawn Betrayer",      // 4 times
		13276: "Wildspawn Imp",           // 21 times
		11452: "Wildspawn Rogue",         // 4 times
		11444: "Gordok Mage-Lord",        // 16 times
		11462: "Warpwood Treant",         // 6 times
		13022: "Whip Lasher",             // 69 times
		13285: "Death Lash",              // 7 times
		11450: "Gordok Reaver",           // 15 times
		13196: "Phase Lasher",            // 6 times
		11456: "Wildspawn Shadowstalker", // 8 times
		11465: "Warpwood Stomper",        // 4 times
		13036: "Gordok Mastiff",          // 24 times
		11448: "Gordok Warlock",          // 15 times
		14351: "Gordok Bushwacker",       // 1 times
		11464: "Warpwood Tangler",        // 3 times
		13021: "Warpwood Crusher",        // 13 times
		11457: "Wildspawn Hellcaller",    // 3 times
		11460: "Alzzin's Minion",         // 15 times
		11461: "Warpwood Guardian",       // 2 times
		13160: "Carrion Swarmer",         // 30 times
		13197: "Fel Lash",                // 4 times
		11455: "Wildspawn Felsworn",      // 4 times
		11453: "Wildspawn Trickster",     // 3 times
	})

	LoadBosses(hostile, map[uint32]string{
		// West
		11488: "Illyanna Ravenoak",
		11487: "Magister Kalendris",
		11496: "Immol'thar",
		11486: "Prince Tortheldrin",

		// North:
		14321: "Guard Fengus",          // 1 times
		14323: "Guard Slip'kik",        // 1 times
		11501: "King Gordok",           // 1 times
		14324: "Cho'Rush the Observer", // 1 times
		14326: "Guard Mol'dar",         // 1 times
		14325: "Captain Kromcrush",     // 1 times

		// East
		14349: "Pimgib",                // 1 times
		13280: "Hydrospawn",            // 1 times
		11492: "Alzzin the Wildshaper", // 1 times
		11490: "Zevrim Thornhoof",      // 1 times
		14327: "Lethtendris",           // 1 times
		14354: "Pusillin",              // 1 times

		// ??
	})

	// Not a hostile
	// 14353: "Mizzle the Crafty", // 1 times
	//11491: "Ironbark the Redeemed",      // 1 times
	//14338: "Knot Thimblejack",           // 1 times
	return hostile
}

func StormwindVaultHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		93106: "Hungry Vault Rat",
		93105: "Shadow Creeper",
		60604: "Wicked Skitterer",
		60612: "Frigid Guardian",
		60601: "Grellkin Sorcerer",
		60599: "Soulless Husk",
		60596: "Runic Construct",
		60602: "Grellkin Scorcher",
		60598: "Black Blood of the Demented",
		10482: "Risen Lackey",
		60597: "Maddened Vault Guard",
		60603: "Manacrazed Grell",
		80852: "Tham'Grarr",
	})
	LoadBosses(hostile, map[uint32]string{
		80853: "Aszosh Grimflame",
		80850: "Black Bride",
		80854: "Damian",
		80851: "Volkan Cruelblade",
		93107: "Arc'tiras",
	})

	return hostile
}

func StockadeHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		1711: "Defias Convict",
		1706: "Defias Prisoner",
		1708: "Defias Inmate",
		1707: "Defias Captive",
		1715: "Defias Insurgent",
	})
	LoadBosses(hostile, map[uint32]string{
		1696: "Targorr the Dread",
		1666: "Kam Deepfury",
		1717: "Hamhock",
		1716: "Bazil Thredd",
		1663: "Dextren Ward",
	})

	return hostile
}

func SunkenTempleHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		8317:  "Atal'ai Deathwalker's Spirit",
		5717:  "Mijan",
		5280:  "Nightmare Wyrmkin",
		5277:  "Nightmare Scalebane",
		5714:  "Loro",
		5713:  "Gasher",
		5226:  "Murk Worm",
		5228:  "Saturated Ooze",
		8510:  "Unknown",
		5270:  "Atal'ai Corpse Eater",
		8384:  "Deep Lurker",
		8319:  "Nightmare Whelp",
		5273:  "Atal'ai High Priest",
		5269:  "Atal'ai Priest",
		5716:  "Zul'Lor",
		5267:  "Unliving Atal'ai",
		8257:  "Oozeling",
		5256:  "Atal'ai Warrior",
		5712:  "Zolo",
		5271:  "Atal'ai Deathwalker",
		5259:  "Atal'ai Witch Doctor",
		8311:  "Slime Maggot",
		5263:  "Mummified Atal'ai",
		5715:  "Hukku",
		8318:  "Atal'ai Slave",
		5283:  "Nightmare Wanderer",
		5291:  "Hakkari Frostwing",
		5708:  "Spawn of Hakkar",
		5711:  "Ogom the Wretched",
		15593: "Elder Starsong",
		8324:  "Atal'ai Skeleton",
		8656:  "Hukku's Voidwalker",
		8657:  "Hukku's Succubus",
		8658:  "Hukku's Imp",
	})
	LoadBosses(hostile, map[uint32]string{
		5710: "Jammal'an the Prophet",
		5711: "Ogom the Wretched",
		5721: "Dreamscythe",
		5719: "Morphaz",
		5722: "Hazzas",
		5709: "Shade of Eranikus",
		5720: "Weaver",
		8580: "Atal'alarion",
	})

	return hostile
}

func TimbermawHoldHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		62886: "Totem of Corruption",         // 2 times
		60684: "Foulheart Manipulator",       // 78 times
		59816: "Corrupted Draenethyst Geode", // 1 times
		49020: "Mind Flay Channeler",         // 1784 times
		60685: "Dirk of the Beast",           // 168 times
		62867: "Enraged Withermaw",
		51296: "Timbermaw Defender",
		62880: "Twisted Rumbler",
		62942: "Withermaw Illuminator",
		51297: "Timbermaw Sentinel",
		62875: "Withermaw Tracker",
		62871: "Withermaw Shaman",
		62882: "Foulheart Satyr",        // 13 times
		62881: "Foulheart Deceiver",     // 9 times
		62883: "Foulheart Trickster",    // 5 times
		57647: "Invading Miasma",        // 8 times
		57649: "Xavian Form",            // 9 times
		62884: "Foulheart Hellcaller",   // 7 times
		62885: "Son of Ursol",           // 4 times
		62874: "Vile Skitterer",         // 2 times
		62878: "Tainted Mass",           // 7 times
		62870: "Withermaw Defiler",      // 5 times
		51608: "Tremor of Ormanos",      // 10 times
		51609: "Son of Ormanos",         // 8 times
		62876: "Withermaw Den Watcher",  // 2 times
		65152: "Creeping Expulsion",     // 3 times
		60699: "Dreamform of Kronn",     // 4 times
		62879: "Corruption of Loktanag", // 17 times
		2141:  "Corrupted Globule",      // 176 times
		62873: "Withermaw Totemic",      // 2 times
		57646: "Dreadful Miasma",        // 120 times
		62872: "Withermaw Pathfinder",   // 3

		29482: "Nightmare Fiend",        // 129 times
		57648: "Xavian Image",           // 15 times
		62943: "Withermaw Shadowkeeper", // 2 times
		29480: "Withermaw Corrupter",    // 11 times
		62877: "Withermaw Ursa",         // 9 times
		29481: "Ursan Horror",           // 39 times
	})
	LoadBosses(hostile, map[uint32]string{
		62937: "Kodiak & Rotgrowl", // "Kodiak",
		62936: "Kodiak & Rotgrowl", // "Rotgrowl",
		62946: "Trioch the Devourer",
		62934: "Karrsh the Sentinel",
		62941: "Chieftain Partath",  // 1 times
		62938: "Archdruid Kronn",    // 1 times
		62940: "Selenaxx Foulheart", // 1 times
		2139:  "Loktanag the Vile",
		62935: "Ormanos the Cracked", // 1 times
		62947: "Ursol",               // 1 times
		60686: "Peroth'arn",          // 1 times
	})

	return hostile
}

func FrostmaneHollowHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		36519: "Frostmane Ritualist",   // 5 times
		96:    "Frostmane Ritualist",   // 7 times
		63134: "Frostmane Leopard",     // 10 times
		63139: "Frostmane Pathfinder",  // 7 times
		51:    "Frostmane Slave",       // 17 times
		19:    "Undermarket Mercenary", // 3 times
		63138: "Frostmane Berserker",   // 5 times
		67:    "Frostmane Cretin",      // 19 times
		63136: "Frostmane Oracle",      // 7 times
		63137: "Frostmane Snowcaller",  // 10 times
		108:   "Frostmane Warrior",     // 9 times
		82:    "Frostmane Tamer",       // 6 times
		63135: "Ice Elemental",         // 3 times
	})
	LoadBosses(hostile, map[uint32]string{
		63131: "Battlemaster Ubukaz", // 1 times
		63132: "Tan'sha the Sleek",   // "Handler Oboka",       // 1 times
		63133: "Tan'sha the Sleek",   // 1 times
		63129: "Kan'za the Seer",     // 1 times
		63130: "Hailar the Frigid",   // 1 times
	})

	return hostile
}

func ZulFarrakHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		5648: "Sandfury Shadowcaster",
		5649: "Sandfury Blood Drinker",
		5650: "Sandfury Witch Doctor",
		7246: "Sandfury Shadowhunter",
		7247: "Sandfury Soul Eater",
		7268: "Sandfury Guardian",
		7269: "Scarab",
		7274: "Sandfury Executioner",
		7787: "Sandfury Slave",
		7788: "Sandfury Drudge",
		7789: "Sandfury Cretin",
		7797: "Ruuzlu",
		8095: "Sul'lithuz Sandcrawler",
		8120: "Sul'lithuz Abomination",
		8876: "Sandfury Acolyte",
		8877: "Sandfury Zealot",

		7604:  "Sergeant Bly",
		7605:  "Raven",
		7606:  "Oro Eyegouge",
		7607:  "Weegli Blastfuse",
		7608:  "Murta Grimgut",
		8130:  "Sul'lithuz Hatchling",
		15578: "Elder Wildmane",
	})
	LoadBosses(hostile, map[uint32]string{
		7271: "Witch Doctor Zum'rah",
		7272: "Theka the Martyr",
		7275: "Shadowpriest Sezz'ziz",
		8127: "Antu'sul",
		7267: "Chief Ukorz Sandscalp",
		7796: "Chief Ukorz Sandscalp",
		7795: "Hydromancer Velratha",
	})

	return hostile
}

// BlackfathomDeepsHostiles returns creature entry IDs for Blackfathom Deeps (map 48).
func BlackfathomDeepsHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4787: "Argent Guard Thaelrid",
		4798: "Fallenroot Shadowstalker",
		4799: "Fallenroot Hellcaller",
		4805: "Blackfathom Sea Witch",
		4807: "Blackfathom Myrmidon",
		4809: "Twilight Acolyte",
		4810: "Twilight Reaver",
		4811: "Twilight Aquamancer",
		4812: "Twilight Loreseeker",
		4813: "Twilight Shadowmage",
		4814: "Twilight Elementalist",
		4815: "Murkshallow Snapclaw",
		4818: "Blindlight Murloc",
		4819: "Blindlight Muckdweller",
		4820: "Blindlight Oracle",
		4821: "Skittering Crustacean",
		4822: "Snapping Crustacean",
		4823: "Barbed Crustacean",
		4824: "Aku'mai Fisher",
		4825: "Aku'mai Snapjaw",
		4827: "Deep Pool Threshfin",
	})
	LoadBosses(hostile, map[uint32]string{
		4829:  "Aku'mai",
		4830:  "Old Serra'kis",
		4831:  "Lady Sarevess",
		4832:  "Twilight Lord Kelris",
		4887:  "Ghamoo-ra",
		6243:  "Gelihast",
		12902: "Lorgus Jett",
	})
	return hostile
}

// UldamanHostiles returns creature entry IDs for Uldaman (map 70).
func UldamanHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		4847:  "Shadowforge Relic Hunter",
		4848:  "Shadowforge Darkcaster",
		4849:  "Shadowforge Archaeologist",
		4850:  "Stonevault Cave Lurker",
		4851:  "Stonevault Rockchewer",
		4852:  "Stonevault Oracle",
		4853:  "Stonevault Geomancer",
		4855:  "Stonevault Brawler",
		4857:  "Stone Keeper",
		4860:  "Stone Steward",
		4861:  "Shrike Bat",
		4863:  "Jadespine Basilisk",
		6907:  "Eric \"The Swift\"",
		6908:  "Olaf",
		7011:  "Earthen Rocksmasher",
		7012:  "Earthen Sculptor",
		7022:  "Venomlash Scorpid",
		7023:  "Obsidian Sentinel",
		7030:  "Shadowforge Geologist",
		7076:  "Earthen Guardian",
		7077:  "Earthen Hallshaper",
		7078:  "Cleft Scorpid",
		7175:  "Stonevault Ambusher",
		7290:  "Shadowforge Sharpshooter",
		7309:  "Earthen Custodian",
		7320:  "Stonevault Mauler",
		7321:  "Stonevault Flameweaver",
		7396:  "Earthen Stonebreaker",
		7397:  "Earthen Stonecarver",
		7405:  "Deadly Cleft Scorpid",
		10120: "Vault Warder",
	})
	LoadBosses(hostile, map[uint32]string{
		2748: "Archaedas",
		4854: "Grimlok",
		6906: "Baelog",
		6910: "Revelosh",
		7206: "Ancient Stone Keeper",
		7228: "Ironaya",
		7291: "Galgann Firehammer",
	})
	return hostile
}

// GnomereganHostiles returns creature entry IDs for Gnomeregan (map 90).
func GnomereganHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		6206:  "Caverndeep Burrower",
		6207:  "Caverndeep Ambusher",
		6211:  "Caverndeep Reaver",
		6212:  "Dark Iron Agent",
		6218:  "Irradiated Slime",
		6219:  "Corrosive Lurker",
		6220:  "Irradiated Horror",
		6222:  "Leprous Technician",
		6223:  "Leprous Defender",
		6224:  "Leprous Machinesmith",
		6225:  "Mechano-Tank",
		6226:  "Mechano-Flamewalker",
		6227:  "Mechano-Frostwalker",
		6230:  "Peacekeeper Security Suit",
		6232:  "Arcane Nullifier X-21",
		6233:  "Mechanized Sentry",
		6234:  "Mechanized Guardian",
		6329:  "Irradiated Pillager",
		6391:  "Holdout Warrior",
		6392:  "Holdout Medic",
		6407:  "Holdout Technician",
		7603:  "Leprous Assistant",
		7849:  "Mobile Alert System",
		7850:  "Kernobee",
		7897:  "Alarm-a-bomb 2600",
		7998:  "Blastmaster Emi Shortfuse",
		13876: "Mekgineer Trigger",
	})
	LoadBosses(hostile, map[uint32]string{
		6229: "Crowd Pummeler 9-60",
		6235: "Electrocutioner 6000",
		7079: "Viscous Fallout",
		7800: "Mekgineer Thermaplugg",
	})
	return hostile
}

// RazorfenDownsHostiles returns creature entry IDs for Razorfen Downs (map 129).
func RazorfenDownsHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		7327: "Withered Warrior",
		7328: "Withered Reaver",
		7329: "Withered Quilguard",
		7332: "Withered Spearhide",
		7333: "Withered Battle Boar",
		7334: "Battle Boar Horror",
		7335: "Death's Head Geomancer",
		7337: "Death's Head Necromancer",
		7341: "Skeletal Frostweaver",
		7342: "Skeletal Summoner",
		7343: "Splinterbone Skeleton",
		7344: "Splinterbone Warrior",
		7345: "Splinterbone Captain",
		7346: "Splinterbone Centurion",
		7347: "Boneflayer Ghoul",
		7348: "Thorn Eater Ghoul",
		7352: "Frozen Soul",
		7353: "Freezing Spirit",
		7354: "Ragglesnout",
		8516: "Belnistrasz",
		8662: "Idol Oven Fire Target",
		8696: "Henry Stern",
		8767: "Sah'rhee",
	})
	LoadBosses(hostile, map[uint32]string{
		7357: "Mordresh Fire Eye",
		7358: "Amnennar the Coldbringer",
		8567: "Glutton",
	})
	return hostile
}

// MaraudonHostiles returns creature entry IDs for Maraudon (map 349).
func MaraudonHostiles() map[uint32]Identity {
	hostile := make(map[uint32]Identity)
	LoadAdds(hostile, map[uint32]string{
		11784: "Theradrim Guardian",
		11789: "Deep Borer",
		11790: "Putridus Satyr",
		11791: "Putridus Trickster",
		11792: "Putridus Shadowstalker",
		11793: "Celebrian Dryad",
		11794: "Sister of Celebras",
		12206: "Primordial Behemoth",
		12207: "Thessala Hydra",
		12216: "Poison Sprite",
		12217: "Corruptor",
		12218: "Vile Larva",
		12219: "Barbed Lasher",
		12220: "Constrictor Vine",
		12221: "Noxious Slime",
		12222: "Creeping Sludge",
		12223: "Cavern Lurker",
		12224: "Cavern Shambler",
		12237: "Meshlok the Harvester",
		12242: "Spirit of Maraudos",
		12243: "Spirit of Veng",
		13141: "Deeprot Stomper",
		13142: "Deeprot Tangler",
		13323: "Subterranean Diemetradon",
		13533: "Spewed Larva",
		13599: "Stolid Snapjaw",
		13743: "Corrupt Force of Nature",
		15556: "Elder Splitrock",
	})
	LoadBosses(hostile, map[uint32]string{
		12201: "Princess Theradras",
		12203: "Landslide",
		12225: "Celebras the Cursed",
		12236: "Lord Vyletongue",
		12258: "Razorlash",
		13282: "Noxxion",
		13596: "Rotgrip",
		13601: "Tinkerer Gizlock",
	})
	return hostile
}
