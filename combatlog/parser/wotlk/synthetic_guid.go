package wotlk

import "github.com/Emyrk/chronicle/combatlog/parser/guid"

// syntheticVehicleEntries are creature entries that WotLK logs encode with
// creature GUID type bits even though the unit behaves as a vehicle.
var syntheticVehicleEntries = map[uint32]struct{}{
	33090: {}, // Pool of Tar
}

// syntheticGUID normalizes known WotLK GUID type mistakes before messages are
// built so every downstream classifier sees the corrected entity type.
func syntheticGUID(id guid.GUID) guid.GUID {
	entry, ok := id.GetEntry()
	if !ok {
		return id
	}
	if _, ok := syntheticVehicleEntries[entry]; !ok {
		return id
	}
	return id.AsVehicle()
}
