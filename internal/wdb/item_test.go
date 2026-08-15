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
	for range 2 { // TBC damage slots
		writeUint32(0)
		writeUint32(0)
		writeUint32(0)
	}
	for range 10 { // armor, resistances, delay, ammo, range modifier
		writeUint32(0)
	}
	for range 5 { // item spells
		for range 6 {
			writeUint32(0)
		}
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
	if item.Description != "TBC description" {
		t.Fatalf("description = %q, want %q", item.Description, "TBC description")
	}
}
