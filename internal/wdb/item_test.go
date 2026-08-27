package wdb

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestParseItemBuild8606UsesTBCLayout(t *testing.T) {
	t.Parallel()

	var data bytes.Buffer
	writeUint32 := func(value uint32) {
		t.Helper()
		if err := binary.Write(&data, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	writeInt32 := func(value int32) {
		t.Helper()
		if err := binary.Write(&data, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	writeString := func(value string) {
		t.Helper()
		if _, err := data.WriteString(value); err != nil {
			t.Fatal(err)
		}
		if err := data.WriteByte(0); err != nil {
			t.Fatal(err)
		}
	}

	writeUint32(4)          // class
	writeUint32(3)          // subclass
	writeUint32(^uint32(0)) // sound override subclass
	writeString("Test Item")
	writeString("")
	writeString("")
	writeString("")
	writeUint32(1234) // display ID
	writeUint32(3)    // quality
	writeUint32(0)    // flags

	for range 17 { // prices through container slots
		writeUint32(0)
	}
	for range 10 { // fixed TBC stat pairs
		writeUint32(0)
		writeUint32(0)
	}
	for range 5 { // TBC damage slots
		writeUint32(0)
		writeUint32(0)
		writeUint32(0)
	}
	writeUint32(123) // armor
	for range 9 {    // resistances, delay, ammo, range modifier
		writeUint32(0)
	}
	writeInt32(28540) // first item spell ID
	writeUint32(0)    // on-use trigger
	writeInt32(1)     // charges
	writeInt32(-1)    // spell cooldown
	writeUint32(4)    // spell category
	writeInt32(-1)    // spell category cooldown
	for range 4 {     // unused item spell slots
		writeInt32(0)
		writeUint32(0)
		writeInt32(0)
		writeInt32(-1)
		writeUint32(0)
		writeInt32(-1)
	}
	writeUint32(0) // bonding
	writeString("TBC description")
	for range 8 { // page text through random property
		writeUint32(0)
	}
	writeUint32(0) // random suffix
	for range 6 {  // block through bag family
		writeUint32(0)
	}
	writeUint32(0) // totem category
	for range 3 {  // sockets
		writeUint32(0)
		writeUint32(0)
	}
	for range 4 { // socket bonus through armor damage modifier
		writeUint32(0)
	}

	item, err := ParseItem(Record{EntryID: 42, Data: data.Bytes()}, 8606)
	if err != nil {
		t.Fatal(err)
	}
	if item.Name != "Test Item" {
		t.Fatalf("name = %q, want %q", item.Name, "Test Item")
	}
	if item.Armor != 123 {
		t.Fatalf("armor = %d, want 123", item.Armor)
	}
	if item.SpellID[0] != 28540 {
		t.Fatalf("first item spell ID = %d, want 28540", item.SpellID[0])
	}
	if item.SpellCooldown[0] != -1 {
		t.Fatalf("first item spell cooldown = %d, want -1", item.SpellCooldown[0])
	}
	if item.Description != "TBC description" {
		t.Fatalf("description = %q, want %q", item.Description, "TBC description")
	}
}
