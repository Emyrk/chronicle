package guid

import (
	"encoding/hex"
	"fmt"
	"math/bits"
)

// GUID represents a World of Warcraft GUID as a 64-bit unsigned integer
type GUID uint64

func FromString(gid string) (GUID, error) {
	data, err := hex.DecodeString(gid[2:])
	if err != nil {
		return 0, err
	}

	if len(data) != 8 {
		return 0, fmt.Errorf("invalid guid: %s", gid)
	}

	var u64 uint64
	for i := 0; i < 8; i++ {
		u64 |= uint64(data[i]) << (8 * (7 - i))
	}

	return GUID(u64), nil
}

func (g GUID) String() string {
	return fmt.Sprintf("0x%016X", uint64(g))
}

// GetHigh returns the high 16 bits of the GUID
func (g GUID) GetHigh() uint16 {
	return uint16(bits.RotateLeft64(uint64(g), -48))
}

// IsPlayer returns true if the GUID represents a player
func (g GUID) IsPlayer() bool {
	return g.GetHigh()&0x00F0 == 0x0000
}

// IsPet returns true if the GUID represents a pet
func (g GUID) IsPet() bool {
	return g.GetHigh()&0x00F0 == 0x0040
}

// IsCreature returns true if the GUID represents a creature
func (g GUID) IsCreature() bool {
	return g.GetHigh()&0x00F0 == 0x0030
}

// IsVehicle returns true if the GUID represents a vehicle
func (g GUID) IsVehicle() bool {
	return g.GetHigh()&0x00F0 == 0x0050
}

// IsAnyCreature returns true if the GUID represents any type of creature (creature, pet, or vehicle)
func (g GUID) IsAnyCreature() bool {
	return g.IsCreature() || g.IsPet() || g.IsVehicle()
}

// IsUnit returns true if the GUID represents a unit (any creature or player)
func (g GUID) IsUnit() bool {
	return g.IsAnyCreature() || g.IsPlayer()
}

// GetEntry returns the entry ID for creatures, or false if not a creature
func (g GUID) GetEntry() (uint32, bool) {
	if g.IsAnyCreature() {
		rotated := bits.RotateLeft64(uint64(g), -24)
		return uint32(rotated & 0x0000000000FFFFFF), true
	}
	return 0, false
}
