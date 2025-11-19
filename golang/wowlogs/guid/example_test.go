package guid_test

import (
	"fmt"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
)

func ExampleGUID() {
	// Create a player GUID
	playerGUID := guid.GUID(0x0000000000000001)
	fmt.Printf("Is player: %v\n", playerGUID.IsPlayer())
	fmt.Printf("Is unit: %v\n", playerGUID.IsUnit())

	// Create a creature GUID with entry ID 12345
	creatureGUID := guid.GUID(0x0030003039000001)
	fmt.Printf("Is creature: %v\n", creatureGUID.IsCreature())
	fmt.Printf("Is any creature: %v\n", creatureGUID.IsAnyCreature())
	if entry, ok := creatureGUID.GetEntry(); ok {
		fmt.Printf("Entry ID: %d\n", entry)
	}

	// Output:
	// Is player: true
	// Is unit: true
	// Is creature: true
	// Is any creature: true
	// Entry ID: 12345
}
