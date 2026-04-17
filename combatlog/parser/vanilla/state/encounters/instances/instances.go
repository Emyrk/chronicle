package instances

import "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"

var (
	WindhornCanyon = (&CommonFactory{
		Name:     "Windhorn Canyon",
		ZoneName: ZoneNameMatcher("windhorn canyon"),
		Hostiles: FromMap(WindhornCanyonHostiles()),
	}).New

	Deadmines = (&CommonFactory{
		Name:     "Deadmines",
		ZoneName: ZoneNameMatcher("the deadmines"),
		Hostiles: FromMap(DeadminesHostiles()),
	}).New

	WailingCaverns = (&CommonFactory{
		Name:     "Wailing Caverns",
		ZoneName: ZoneNameMatcher("wailing caverns"),
		Hostiles: FromMap(WailingCavernsHostiles()),
	}).New

	RazorfenKraul = (&CommonFactory{
		Name:     "Razorfen Kraul",
		ZoneName: ZoneNameMatcher("razorfen kraul"),
		Hostiles: FromMap(RazorfenKraulHostiles()),
	}).New

	ScarletMonasteryCathedral = (&CommonFactory{
		Name:     "Scarlet Monastery Cathedral",
		ZoneName: ZoneNameMatcher("scarlet monastery cathedral"),
		Hostiles: FromMap(CathedralHostiles()),
	}).New

	ScarletMonasteryLibrary = (&CommonFactory{
		Name:     "Scarlet Monastery Library",
		ZoneName: ZoneNameMatcher("scarlet monastery library"),
		Hostiles: FromMap(SMLibraryHostiles()),
	}).New

	BlackrockSpire = (&CommonFactory{
		Name:     "Blackrock Spire",
		ZoneName: ZoneNameMatcher("blackrock spire"),
		Hostiles: FromMap(BlackrockSpireHostiles()),
	}).New

	MoltenCore = (&CommonFactory{
		Name:     "Molten Core",
		ZoneName: ZoneNameMatcher("molten core"),
		Hostiles: FromMap(MoltenCoreHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: MoltenCoreSpeedrunRequirements(),
			},
		},
	}).New

	TowerOfKarazhan = (&CommonFactory{
		Name:     "Tower of Karazhan",
		ZoneName: ZoneNameMatcher("tower of karazhan", "the rock of desolation"),
		Hostiles: FromMap(TowerOfKarazhanHostiles()),
	}).New

	Onyxia = (&CommonFactory{
		Name:     "Onyxia's Lair",
		ZoneName: ZoneNameMatcher("onyxia's lair"),
		Hostiles: FromMap(OnyxiaHostiles()),
	}).New

	RagefireChasm = (&CommonFactory{
		Name:     "Ragefire Chasm",
		ZoneName: ZoneNameMatcher("ragefire chasm"),
		Hostiles: FromMap(RagefireChasmHostiles()),
	}).New

	ZulGurub = (&CommonFactory{
		Name:     "Zul'Gurub",
		ZoneName: ZoneNameMatcher("zul'gurub"),
		Hostiles: FromMap(ZulGurubHostiles()),
	}).New

	EmeraldSanctum = (&CommonFactory{
		Name:     "Emerald Sanctum",
		ZoneName: ZoneNameMatcher("emerald sanctum"),
		Hostiles: FromMap(EmeraldSanctumHostiles()),
	}).New

	BlackrockDepths = (&CommonFactory{
		Name:     "Blackrock Depths",
		ZoneName: ZoneNameMatcher("blackrock depths"),
		Hostiles: FromMap(BlackrockDepthsHostiles()),
	}).New

	Scholomance = (&CommonFactory{
		Name:     "Scholomance",
		ZoneName: ZoneNameMatcher("scholomance"),
		Hostiles: FromMap(ScholomanceHostiles()),
	}).New

	TempleOfAhnQiraj = (&CommonFactory{
		Name:     "Temple of Ahn'Qiraj",
		ZoneName: ZoneNameMatcher("ahn'qiraj"),
		Hostiles: FromMap(TempleOfAhnQirajHostiles()),
	}).New

	RuinsOfAhnQiraj = (&CommonFactory{
		Name:     "Ruins of Ahn'Qiraj",
		ZoneName: ZoneNameMatcher("ruins of ahn'qiraj"),
		Hostiles: FromMap(RuinsOfAhnQirajHostiles()),
	}).New

	BlackwingLair = (&CommonFactory{
		Name:     "Blackwing Lair",
		ZoneName: ZoneNameMatcher("blackwing lair"),
		Hostiles: FromMap(BlackwingLairHostiles()),
	}).New

	Naxxramas = (&CommonFactory{
		Name:     "Naxxramas",
		ZoneName: ZoneNameMatcher("naxxramas", "the upper necropolis"),
		Hostiles: FromMap(NaxxramasHostiles()),
	}).New

	Stratholme = (&CommonFactory{
		Name:     "Stratholme",
		ZoneName: ZoneNameMatcher("stratholme"),
		Hostiles: FromMap(StratholmeHostiles()),
	}).New

	BlackMorass = (&CommonFactory{
		Name:     "Black Morass",
		ZoneName: ZoneNameMatcher("the black morass"),
		Hostiles: FromMap(TheBlackMorassHostiles()),
	}).New

	DireMaul = (&CommonFactory{
		Name:     "Dire Maul",
		ZoneName: ZoneNameMatcher("dire maul"),
		Hostiles: FromMap(DireMaulHostiles()),
	}).New

	StormwindVault = (&CommonFactory{
		Name:     "Stormwind Vault",
		ZoneName: ZoneNameMatcher("stormwind vault"),
		Hostiles: FromMap(StormwindVaultHostiles()),
	}).New

	Stockades = (&CommonFactory{
		Name:     "Stormwind Stockade",
		ZoneName: ZoneNameMatcher("the stockade"),
		Hostiles: FromMap(StockadeHostiles()),
	}).New

	SunkenTemple = (&CommonFactory{
		Name:     "Sunken Temple",
		ZoneName: ZoneNameMatcher("the temple of atal'hakkar"),
		Hostiles: FromMap(SunkenTempleHostiles()),
	}).New

	TimbermawHold = (&CommonFactory{
		Name:     "Timbermaw Hold",
		ZoneName: ZoneNameMatcher("timbermaw hold"),
		Hostiles: FromMap(TimbermawHoldHostiles()),
	}).New

	FrostmaneHollow = (&CommonFactory{
		Name:     "Frostmane Hollow",
		ZoneName: ZoneNameMatcher("frostmane hollow"),
		Hostiles: FromMap(FrostmaneHollowHostiles()),
	}).New
)
