//go:build windows

package main

import (
	"bytes"
	"encoding/binary"
)

// platformIcon wraps the PNGs in an ICO container, which is what the Windows
// tray requires.
func platformIcon(imgs []sizedPNG) []byte {
	var b bytes.Buffer
	_ = binary.Write(&b, binary.LittleEndian, []uint16{0, 1, uint16(len(imgs))}) // reserved, type=icon, count
	offset := 6 + 16*len(imgs)
	for _, img := range imgs {
		b.Write([]byte{byte(img.size), byte(img.size), 0, 0})      // w, h, palette, reserved
		_ = binary.Write(&b, binary.LittleEndian, []uint16{1, 32}) // planes, bpp
		_ = binary.Write(&b, binary.LittleEndian, uint32(len(img.data)))
		_ = binary.Write(&b, binary.LittleEndian, uint32(offset))
		offset += len(img.data)
	}
	for _, img := range imgs {
		b.Write(img.data)
	}
	return b.Bytes()
}
