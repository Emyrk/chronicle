//go:build windows

package main

import (
	"bytes"
	"encoding/binary"
)

// platformIcon wraps the PNG in an ICO container, which is what the Windows
// tray requires.
func platformIcon(pngData []byte, size int) []byte {
	var b bytes.Buffer
	_ = binary.Write(&b, binary.LittleEndian, []uint16{0, 1, 1}) // reserved, type=icon, count
	b.Write([]byte{byte(size), byte(size), 0, 0})                // w, h, palette, reserved
	_ = binary.Write(&b, binary.LittleEndian, []uint16{1, 32})   // planes, bpp
	_ = binary.Write(&b, binary.LittleEndian, uint32(len(pngData)))
	_ = binary.Write(&b, binary.LittleEndian, uint32(22)) // data offset: 6 + 16
	b.Write(pngData)
	return b.Bytes()
}
