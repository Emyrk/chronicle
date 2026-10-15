package main

//go:generate go run ../../scripts/uploader-icon packaging/stone.svg icons packaging/AppIcon.icns

import (
	"bytes"
	_ "embed"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"sync"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
)

// The stone bodies (no spiral) and the spiral masks are rendered from
// packaging/stone.svg (make uploader/icons). The mask is white with alpha; it
// is tinted with the state colour and composited over the body.
var (
	//go:embed icons/stone_black_36.png
	stoneBlack []byte // macOS body for a light menu bar, 36 px = 18 pt @2x
	//go:embed icons/stone_white_36.png
	stoneWhite []byte // macOS body for a dark menu bar
	//go:embed icons/stone_color_16.png
	stoneColor16 []byte
	//go:embed icons/stone_color_32.png
	stoneColor32 []byte
	//go:embed icons/swirl_mask_16.png
	swirlMask16 []byte
	//go:embed icons/swirl_mask_32.png
	swirlMask32 []byte
	//go:embed icons/swirl_mask_36.png
	swirlMask36 []byte
)

var stateColors = map[engine.State]color.NRGBA{
	engine.StateIdle:      {0x8a, 0x8f, 0x98, 0xff}, // grey: waiting for WoW
	engine.StateNoLog:     {0xe5, 0x48, 0x4d, 0xff}, // red: WoW running, not logging
	engine.StateWaiting:   {0xf9, 0x73, 0x16, 0xff}, // orange: logging on, waiting for a fight
	engine.StateRecording: {0x22, 0xc5, 0x5e, 0xff}, // green: recording
	engine.StateUploading: {0x3b, 0x82, 0xf6, 0xff}, // blue: uploading
	engine.StateUploaded:  {0x22, 0xc5, 0x5e, 0xff}, // green: uploaded
	engine.StateReconnect: {0xf2, 0xc1, 0x2e, 0xff}, // yellow: not connected
}

type iconKey struct {
	state engine.State
	dark  bool
}

var (
	iconMu    sync.Mutex
	iconCache = map[iconKey][]byte{}
)

// trayIcon returns the stone with its spiral in the state's colour, in the
// platform's icon format.
func trayIcon(s engine.State) []byte {
	dark := menuBarDark()
	iconMu.Lock()
	defer iconMu.Unlock()
	key := iconKey{s, dark}
	if b, ok := iconCache[key]; ok {
		return b
	}
	b := platformIcon(buildIcons(s, dark))
	iconCache[key] = b
	return b
}

type sizedPNG struct {
	data []byte
	size int
}

// buildIcons composites the tinted spiral onto the body(ies) this platform uses.
func buildIcons(s engine.State, dark bool) []sizedPNG {
	type pair struct{ body, mask []byte }
	pairs := []pair{{stoneColor16, swirlMask16}, {stoneColor32, swirlMask32}}
	if monoGlyph {
		pairs = []pair{{stoneBlack, swirlMask36}}
		if dark {
			pairs = []pair{{stoneWhite, swirlMask36}}
		}
	}
	out := make([]sizedPNG, 0, len(pairs))
	for _, p := range pairs {
		img := swirlOnBody(p.body, p.mask, stateColors[s])
		var buf bytes.Buffer
		_ = png.Encode(&buf, img)
		out = append(out, sizedPNG{buf.Bytes(), img.Bounds().Dx()})
	}
	return out
}

// swirlOnBody paints the mask tinted with c over the body.
func swirlOnBody(bodyPNG, maskPNG []byte, c color.NRGBA) *image.NRGBA {
	body := decodePNG(bodyPNG)
	mask := decodePNG(maskPNG)
	dst := image.NewNRGBA(body.Bounds())
	draw.Draw(dst, dst.Bounds(), body, image.Point{}, draw.Src)
	draw.DrawMask(dst, dst.Bounds(), image.NewUniform(c), image.Point{}, mask, image.Point{}, draw.Over)
	return dst
}

func decodePNG(b []byte) image.Image {
	img, err := png.Decode(bytes.NewReader(b))
	if err != nil {
		panic(err) // embedded asset
	}
	return img
}
