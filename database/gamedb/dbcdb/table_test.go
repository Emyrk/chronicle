package dbcdb

import (
	"encoding/binary"
	"testing"

	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbd"
	"github.com/Gophercraft/core/vsn"
	"github.com/stretchr/testify/require"
)

type testDBCEntry struct {
	ID    int32
	Value int32
}

func TestWrapTableIndexesInlineIDWithoutDecodingRows(t *testing.T) {
	t.Parallel()

	records := make([]byte, 16)
	binary.LittleEndian.PutUint32(records[0:4], 5)
	binary.LittleEndian.PutUint32(records[4:8], 42)
	binary.LittleEndian.PutUint32(records[8:12], 7)
	binary.LittleEndian.PutUint32(records[12:16], 84)

	table := &dbc.Table{
		DB: dbc.NewDB(vsn.V1_12_1),
		Header: dbc.FileHeader{
			RecordCount: 2,
			RecordSize:  8,
		},
		Definition: &dbd.Definition{Columns: []dbd.ColumnDefinition{
			{Name: "Value", Type: dbd.Int, Verified: true, HintBits: 32},
			{Name: "ID", Type: dbd.Int, Verified: true, HintBits: 32},
		}},
		Layout: &dbd.Layout{Columns: []dbd.LayoutColumn{
			{Name: "Value", Bits: 32, ArraySize: -1},
			{Name: "ID", Bits: 32, ArraySize: -1, Options: []string{"id"}},
		}},
		Records: records,
	}

	lookup, ok := rawIDLookup(table)
	require.True(t, ok)
	require.Equal(t, map[int]int{42: 0, 84: 1}, lookup)

	entry, err := WrapTable[testDBCEntry](table).ID(84)
	require.NoError(t, err)
	require.Equal(t, &testDBCEntry{ID: 84, Value: 7}, entry)
}

type arrayOffsetDBCEntry struct {
	Values []int32
	ID     int32
}

func TestWrapTableIndexesIDAfterArrayColumn(t *testing.T) {
	t.Parallel()

	records := make([]byte, 24)
	binary.LittleEndian.PutUint32(records[0:4], 1)
	binary.LittleEndian.PutUint32(records[4:8], 2)
	binary.LittleEndian.PutUint32(records[8:12], 42)
	binary.LittleEndian.PutUint32(records[12:16], 3)
	binary.LittleEndian.PutUint32(records[16:20], 4)
	binary.LittleEndian.PutUint32(records[20:24], 84)

	table := &dbc.Table{
		DB: dbc.NewDB(vsn.V1_12_1),
		Header: dbc.FileHeader{
			RecordCount: 2,
			RecordSize:  12,
		},
		Definition: &dbd.Definition{Columns: []dbd.ColumnDefinition{
			{Name: "Values", Type: dbd.Int, Verified: true, HintArray: true, HintBits: 32},
			{Name: "ID", Type: dbd.Int, Verified: true, HintBits: 32},
		}},
		Layout: &dbd.Layout{Columns: []dbd.LayoutColumn{
			{Name: "Values", Bits: 32, ArraySize: 2},
			{Name: "ID", Bits: 32, ArraySize: -1, Options: []string{"id"}},
		}},
		Records: records,
	}

	entry, err := WrapTable[arrayOffsetDBCEntry](table).ID(84)
	require.NoError(t, err)
	require.Equal(t, &arrayOffsetDBCEntry{Values: []int32{3, 4}, ID: 84}, entry)
}

func TestWrapTableIndexesNonInlineID(t *testing.T) {
	t.Parallel()

	records := make([]byte, 8)
	binary.LittleEndian.PutUint32(records[0:4], 5)
	binary.LittleEndian.PutUint32(records[4:8], 9)

	table := &dbc.Table{
		DB: dbc.NewDB(vsn.V1_12_1),
		Header: dbc.FileHeader{
			RecordCount: 2,
			RecordSize:  4,
		},
		Definition: &dbd.Definition{Columns: []dbd.ColumnDefinition{
			{Name: "ID", Type: dbd.Int, Verified: true, HintBits: 32},
			{Name: "Value", Type: dbd.Int, Verified: true, HintBits: 32},
		}},
		Layout: &dbd.Layout{Columns: []dbd.LayoutColumn{
			{Name: "ID", Bits: 32, ArraySize: -1, Options: []string{"id", "noninline"}},
			{Name: "Value", Bits: 32, ArraySize: -1},
		}},
		Records: records,
	}

	entry, err := WrapTable[testDBCEntry](table).ID(2)
	require.NoError(t, err)
	require.Equal(t, &testDBCEntry{ID: 2, Value: 9}, entry)
}
