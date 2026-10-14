package dbcdb

import (
	"encoding/binary"
	"fmt"
	"reflect"

	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbd"
)

type Table[T any] interface {
	Underlying() *dbc.Table
	Len() int
	Range(f func(cursor *T) bool) error
	Index(i int) (*T, error)
	ID(id int) (*T, error)
	StringRef(i int) (string, error)
}

func WrapTable[T any](t *dbc.Table) Table[T] {
	// Lookup by index is O(1), but lookup by ID is O(n). Build an ID index
	// directly from the raw records so wrapping a table does not decode every
	// column of every row.
	lookup, ok := rawIDLookup(t)
	if !ok {
		lookup = make(map[int]int)
		idx := 0
		err := t.Range(func(cursor *T) bool {
			id := reflect.ValueOf(cursor).Elem().Field(0).Int()
			lookup[int(id)] = idx
			idx++
			return true
		})
		if err != nil {
			panic("failed to wrap table: " + err.Error())
		}
	}

	return &WrappedTable[T]{
		wrapped:    t,
		idxMapping: lookup,
	}
}

func rawIDLookup(t *dbc.Table) (map[int]int, bool) {
	idColumn := t.Layout.IDColumn()
	if idColumn == nil {
		return nil, false
	}

	idDefinition := t.Definition.Column(idColumn.Name)
	if idDefinition == nil {
		return nil, false
	}

	lookup := make(map[int]int, t.Len())
	if idColumn.HasOption("noninline") {
		if idDefinition.Type != dbd.Int {
			return nil, false
		}
		for idx := range t.Len() {
			lookup[idx+1] = idx
		}
		return lookup, true
	}

	offset := 0
	for i := range t.Layout.Columns {
		column := &t.Layout.Columns[i]
		if column.HasOption("noninline") {
			continue
		}

		definition := t.Definition.Column(column.Name)
		if definition == nil {
			return nil, false
		}
		width, ok := dbcColumnWidth(t, definition, column)
		if !ok {
			return nil, false
		}
		if column != idColumn {
			offset += width
			continue
		}
		if column.ArraySize > 1 {
			return nil, false
		}

		for idx := range t.Len() {
			start := idx*int(t.Header.RecordSize) + offset
			if start < 0 || start+width > len(t.Records) {
				return nil, false
			}
			id, ok := decodeDBCInteger(t.Records[start:start+width], definition.Type, column.Signed)
			if !ok {
				return nil, false
			}
			lookup[id] = idx
		}
		return lookup, true
	}

	return nil, false
}

func dbcColumnWidth(t *dbc.Table, definition *dbd.ColumnDefinition, column *dbd.LayoutColumn) (int, bool) {
	var width int
	switch definition.Type {
	case dbd.Uint, dbd.Int, dbd.Float:
		if column.Bits%8 != 0 {
			return 0, false
		}
		width = column.Bits / 8
	case dbd.Bool:
		width = 1
	case dbd.String:
		width = 4
	case dbd.LocString:
		locales, err := dbc.LocStringSize(t.DB.Build)
		if err != nil {
			return 0, false
		}
		width = 4 * locales
	default:
		return 0, false
	}

	if column.ArraySize >= 0 {
		width *= column.ArraySize
	}
	return width, width > 0
}

func decodeDBCInteger(data []byte, typ dbd.ColumnType, signed bool) (int, bool) {
	var value uint64
	switch len(data) {
	case 1:
		value = uint64(data[0])
	case 2:
		value = uint64(binary.LittleEndian.Uint16(data))
	case 4:
		value = uint64(binary.LittleEndian.Uint32(data))
	case 8:
		value = binary.LittleEndian.Uint64(data)
	default:
		return 0, false
	}

	switch typ {
	case dbd.Uint:
		return int(value), true
	case dbd.Int:
		if !signed {
			return int(value), true
		}
		switch len(data) {
		case 1:
			return int(int8(value)), true
		case 2:
			return int(int16(value)), true
		case 4:
			return int(int32(value)), true
		case 8:
			return int(int64(value)), true
		}
	}
	return 0, false
}

type WrappedTable[T any] struct {
	wrapped    *dbc.Table
	idxMapping map[int]int
}

func (w WrappedTable[T]) Len() int {
	return w.wrapped.Len()
}

func (w WrappedTable[T]) Underlying() *dbc.Table {
	return w.wrapped
}

func (w *WrappedTable[T]) Range(f func(cursor *T) bool) error {
	return w.wrapped.Range(func(cursor *T) bool {
		return f(cursor)
	})
}

func (w *WrappedTable[T]) ID(i int) (*T, error) {
	if idx, ok := w.idxMapping[i]; ok {
		return w.Index(idx)
	}

	return nil, fmt.Errorf("record not found: %d", i)

	//x := new(T)
	//if err := w.wrapped.ID(i, x); err != nil {
	//	return nil, err
	//}
	//return x, nil
}

func (w *WrappedTable[T]) Index(i int) (*T, error) {
	x := new(T)
	if err := w.wrapped.Index(i, x); err != nil {
		return nil, err
	}
	return x, nil
}

func (w *WrappedTable[T]) StringRef(i int) (string, error) {
	return w.wrapped.StringRef(i)
}
