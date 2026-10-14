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
	engine.StateIdle:      {0x8a, 0x8f, 0x98, 0xff}, // grey: waiting for WoW
	engine.StateNoLog:     {0xe5, 0x48, 0x4d, 0xff}, // red: WoW running, not logging
	engine.StateWaiting:   {0xf9, 0x73, 0x16, 0xff}, // orange: logging on, waiting for a fight
	engine.StateRecording: {0x22, 0xc5, 0x5e, 0xff}, // green: recording
	engine.StateUploading: {0x3b, 0x82, 0xf6, 0xff}, // blue: uploading
	engine.StateUploaded:  {0x22, 0xc5, 0x5e, 0xff}, // green + check: uploaded
	engine.StateReconnect: {0xf2, 0xc1, 0x2e, 0xff}, // yellow: not connected
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
	if s == engine.StateUploaded {
		drawCheck(img, color.NRGBA{0xff, 0xff, 0xff, 0xff})
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	b := platformIcon(buf.Bytes(), size)
	iconCache[s] = b
	return b
}

// drawCheck draws a white check mark so "uploaded" differs from "recording".
func drawCheck(img *image.NRGBA, c color.NRGBA) {
	line := func(x0, y0, x1, y1 int) {
		for i := 0; i <= 20; i++ {
			x, y := x0+(x1-x0)*i/20, y0+(y1-y0)*i/20
			for dx := -1; dx <= 1; dx++ {
				for dy := -1; dy <= 1; dy++ {
					img.SetNRGBA(x+dx, y+dy, c)
				}
			}
		}
	}
	line(9, 17, 14, 22)
	line(14, 22, 23, 10)
}
