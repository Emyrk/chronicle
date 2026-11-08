package api

import "github.com/Emyrk/chronicle/database"

func resolvePlayerFaction(
	explicit database.NullWowPlayerFaction,
	race database.WowPlayableRace,
	flavor database.WoWFlavor,
) database.NullWowPlayerFaction {
	if explicit.Valid {
		return explicit
	}

	var faction database.WowPlayerFaction
	switch race {
	case database.WowPlayableRaceHuman,
		database.WowPlayableRaceGnome,
		database.WowPlayableRaceDwarf,
		database.WowPlayableRaceNightElf,
		database.WowPlayableRaceDraenei:
		faction = database.WowPlayerFactionAlliance
	case database.WowPlayableRaceScourge,
		database.WowPlayableRaceOrc,
		database.WowPlayableRaceTroll,
		database.WowPlayableRaceTauren,
		database.WowPlayableRaceGoblin:
		faction = database.WowPlayerFactionHorde
	case database.WowPlayableRaceBloodElf:
		if flavor.Has(database.FlavorNightmareOfUrsol) {
			faction = database.WowPlayerFactionAlliance
		} else {
			faction = database.WowPlayerFactionHorde
		}
	default:
		return database.NullWowPlayerFaction{}
	}

	return database.NullWowPlayerFaction{WowPlayerFaction: faction, Valid: true}
}
