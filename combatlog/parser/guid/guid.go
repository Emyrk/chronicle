package guid

import (
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/bits"

	"github.com/lib/pq"
	"golang.org/x/xerrors"
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
	// MarshalJSON needs quoted string for JSON values
	return json.Marshal(g.String())
}

func (g *GUID) UnmarshalJSON(data []byte) error {
	var gidStr string
	if err := json.Unmarshal(data, &gidStr); err != nil {
		return err
	}
	return g.UnmarshalText([]byte(gidStr))
}

func (g GUID) MarshalText() ([]byte, error) {
	return []byte(g.String()), nil
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

func (g GUID) IsObject() bool {
	return g.GetHigh()&0x00F0 == 0x0010
}

// IsPet returns true if the GUID represents a pet
func (g GUID) IsPet() bool {
	return g.GetHigh()&0x00F0 == 0x0040
}

func (g GUID) AsPet() GUID {
	// Clear type bits (0x00F0 at position 48) and set pet type (0x0040)
	return GUID((uint64(g) &^ 0x00F0000000000000) | 0x0040000000000000)
}

// IsCreature returns true if the GUID represents a creature
func (g GUID) IsCreature() bool {
	return g.GetHigh()&0x00F0 == 0x0030
}

// IsVehicle returns true if the GUID represents a vehicle
func (g GUID) IsVehicle() bool {
	return g.GetHigh()&0x00F0 == 0x0050
}

func (g GUID) AsVehicle() GUID {
	// Clear type bits (0x00F0 at position 48) and set vehicle type (0x0050).
	return GUID((uint64(g) &^ 0x00F0000000000000) | 0x0050000000000000)
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
	if g.IsAnyCreature() || g.IsObject() {
		rotated := bits.RotateLeft64(uint64(g), -24)
		return uint32(rotated & 0x0000000000FFFFFF), true
	}
	return 0, false
}

func MustEntry(id GUID) uint32 {
	entry, ok := id.GetEntry()
	if !ok {
		panic("GUID is not a creature")
	}
	return entry
}

func (a *GUID) Scan(src interface{}) error {
	var err error
	switch v := src.(type) {
	case string:
		*a, err = FromString(v)
		if err != nil {
			return err
		}
		return nil
	default:
		return xerrors.Errorf("unexpected type %T", src)
	}
}

func (a GUID) Value() (driver.Value, error) {
	return a.String(), nil
}

type GUIDs []GUID

// Value implements database/sql/driver.Valuer for encoding to PostgreSQL.
// Encodes as a PostgreSQL text array literal: {0x...,0x...}
func (g GUIDs) Value() (driver.Value, error) {
	return pq.Array(g).Value()
}

// Scan implements database/sql.Scanner for decoding from PostgreSQL.
func (g *GUIDs) Scan(src interface{}) error {
	var ids []string
	err := pq.Array(&ids).Scan(src)
	if err != nil {
		return err
	}

	gids := make([]GUID, 0, len(ids))
	for _, idStr := range ids {
		gid, err := FromString(idStr)
		if err != nil {
			return err
		}
		gids = append(gids, gid)
	}
	*g = gids
	return nil
}
