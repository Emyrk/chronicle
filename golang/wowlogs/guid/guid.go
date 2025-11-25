package guid

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/bits"
)

// GUID represents a World of Warcraft GUID as a 64-bit unsigned integer
type GUID uint64

func FromString(gid string) (GUID, error) {
	if len(gid) != 18 || gid[0:2] != "0x" {
		return 0, fmt.Errorf("invalid guid: %s", gid)
	}
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

func (g GUID) MarshalJSON() ([]byte, error) {
	return g.MarshalText()

}

func (g *GUID) UnmarshalJSON(data []byte) error {
	var gidStr string
	if err := json.Unmarshal(data, &gidStr); err != nil {
		return err
	}
	return g.UnmarshalText([]byte(gidStr))
}

func (g GUID) MarshalText() ([]byte, error) {
	return json.Marshal(g.String())
}

func (g *GUID) UnmarshalText(data []byte) error {
	id, err := FromString(string(data))
	if err != nil {
		return err
	}
	*g = id
	return nil
}

func (g GUID) IsZero() bool {
	return g == 0
}

func (g GUID) String() string {
	return fmt.Sprintf("0x%016X", uint64(g))
}

// GetHigh returns the high 16 bits of the GUID
func (g GUID) GetHigh() uint16 {
	// 0x0000000000024225 --> 0x0000
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
