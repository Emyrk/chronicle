package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"sync"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
)

var stateColors = map[engine.State]color.NRGBA{
	engine.StateIdle:      {0x8a, 0x8f, 0x98, 0xff},
	engine.StateNoLog:     {0xf2, 0xc1, 0x2e, 0xff},
	engine.StateRecording: {0xe5, 0x48, 0x4d, 0xff},
	engine.StateUploading: {0x3b, 0x82, 0xf6, 0xff},
	engine.StateUploaded:  {0x22, 0xc5, 0x5e, 0xff},
	engine.StateReconnect: {0xf9, 0x73, 0x16, 0xff},
}

var (
	iconMu    sync.Mutex
	iconCache = map[engine.State][]byte{}
)

// trayIcon draws a filled circle in the state's colour. Icons are generated
// rather than embedded so there are no assets to ship.
func trayIcon(s engine.State) []byte {
	iconMu.Lock()
	defer iconMu.Unlock()
	if b, ok := iconCache[s]; ok {
		return b
	}
	const size = 32
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	c := stateColors[s]
	const r = size/2 - 2
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			dx, dy := x-size/2, y-size/2
			if dx*dx+dy*dy <= r*r {
				img.SetNRGBA(x, y, c)
			}
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	b := platformIcon(buf.Bytes(), size)
	iconCache[s] = b
	return b
}
