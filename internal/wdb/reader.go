package wdb

import (
	"encoding/binary"
	"fmt"
	"math"
)

// reader is a cursor over a byte slice for sequential field parsing.
type reader struct {
	data []byte
	off  int
}

func newReader(data []byte) *reader {
	return &reader{data: data}
}

func (r *reader) remaining() int {
	return len(r.data) - r.off
}

func (r *reader) Uint32() (uint32, error) {
	if r.remaining() < 4 {
		return 0, fmt.Errorf("offset %d: need 4 bytes, have %d", r.off, r.remaining())
	}
	v := binary.LittleEndian.Uint32(r.data[r.off:])
	r.off += 4
	return v, nil
}

func (r *reader) Int32() (int32, error) {
	v, err := r.Uint32()
	return int32(v), err
}

func (r *reader) Uint8() (byte, error) {
	if r.remaining() < 1 {
		return 0, fmt.Errorf("offset %d: need 1 byte, have %d", r.off, r.remaining())
	}
	v := r.data[r.off]
	r.off++
	return v, nil
}

func (r *reader) Float32() (float32, error) {
	v, err := r.Uint32()
	return math.Float32frombits(v), err
}

// String reads a null-terminated string.
func (r *reader) String() (string, error) {
	for i := r.off; i < len(r.data); i++ {
		if r.data[i] == 0 {
			s := string(r.data[r.off:i])
			r.off = i + 1
			return s, nil
		}
	}
	return "", fmt.Errorf("offset %d: no null terminator found", r.off)
}

// Skip advances the cursor by n bytes.
func (r *reader) Skip(n int) error {
	if r.remaining() < n {
		return fmt.Errorf("offset %d: skip %d but only %d remaining", r.off, n, r.remaining())
	}
	r.off += n
	return nil
}
