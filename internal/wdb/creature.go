package wdb

import "fmt"

// Creature represents a parsed creature from creaturecache.wdb.
// Field layout matches the WotLK 3.3.5a SMSG_CREATURE_QUERY_RESPONSE.
type Creature struct {
	Entry      uint32
	Name       string
	Name2      string
	Name3      string
	Name4      string
	SubName    string
	IconName   string // cursor icon
	TypeFlags  uint32
	Type       uint32 // CreatureType (beast, humanoid, etc.)
	Family     uint32
	Rank       uint32 // normal, elite, rare, etc.
	KillCredit [2]uint32
	DisplayID  [4]uint32
	HpMulti    float32
	ManaMulti  float32
	RacialLeader uint8
	QuestItems [6]uint32
	MovementID uint32
}

// ParseCreature parses a single creature record from creaturecache.wdb.
func ParseCreature(rec Record) (Creature, error) {
	c := Creature{Entry: rec.EntryID}
	r := newReader(rec.Data)
	var err error

	u := func() uint32 { var v uint32; if err == nil { v, err = r.Uint32() }; return v }
	f := func() float32 { var v float32; if err == nil { v, err = r.Float32() }; return v }
	s := func() string { var v string; if err == nil { v, err = r.String() }; return v }

	c.Name = s()
	c.Name2 = s()
	c.Name3 = s()
	c.Name4 = s()
	c.SubName = s()
	c.IconName = s()
	c.TypeFlags = u()
	c.Type = u()
	c.Family = u()
	c.Rank = u()
	c.KillCredit[0] = u()
	c.KillCredit[1] = u()
	c.DisplayID[0] = u()
	c.DisplayID[1] = u()
	c.DisplayID[2] = u()
	c.DisplayID[3] = u()
	c.HpMulti = f()
	c.ManaMulti = f()
	if err == nil {
		var b byte
		b, err = r.Uint8()
		c.RacialLeader = b
	}
	for j := range 6 {
		c.QuestItems[j] = u()
	}
	c.MovementID = u()

	if err != nil {
		return c, fmt.Errorf("parse creature %d: %w", rec.EntryID, err)
	}
	return c, nil
}
