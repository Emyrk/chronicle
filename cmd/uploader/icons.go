package main

//go:generate go run ../../scripts/uploader-icon packaging/stone.svg icons packaging/AppIcon.icns

import (
	"bytes"
	_ "embed"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"sync"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
)

// The glyphs are rendered from packaging/stone.svg (make uploader/icons).
var (
	//go:embed icons/stone_black_36.png
	stoneBlack []byte // macOS glyph for a light menu bar, 36 px = 18 pt @2x
	//go:embed icons/stone_white_36.png
	stoneWhite []byte // macOS glyph for a dark menu bar
	//go:embed icons/stone_color_16.png
	stoneColor16 []byte
	//go:embed icons/stone_color_32.png
	stoneColor32 []byte
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

// trayIcon returns the stone glyph with the state's coloured dot in the
// bottom-right corner, in the platform's icon format.
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

// buildIcons composites the dot onto the glyph(s) this platform uses.
func buildIcons(s engine.State, dark bool) []sizedPNG {
	srcs := [][]byte{stoneColor16, stoneColor32}
	if monoGlyph {
		srcs = [][]byte{stoneBlack}
		if dark {
			srcs = [][]byte{stoneWhite}
		}
	}
	out := make([]sizedPNG, 0, len(srcs))
	for _, src := range srcs {
		img, err := png.Decode(bytes.NewReader(src))
		if err != nil {
			panic(err) // embedded asset
		}
		dst := image.NewNRGBA(img.Bounds())
		draw.Draw(dst, dst.Bounds(), img, image.Point{}, draw.Src)
		size := dst.Bounds().Dx()
		drawDot(dst, stateColors[s])
		var buf bytes.Buffer
		_ = png.Encode(&buf, dst)
		out = append(out, sizedPNG{buf.Bytes(), size})
	}
	return out
}

// drawDot paints the state dot (7/36 of the icon wide, 14 px at 36 px) in the
// bottom-right corner, with a transparent ring around it so it separates from
// the glyph on light and dark bars.
func drawDot(img *image.NRGBA, c color.NRGBA) {
	size := float64(img.Bounds().Dx())
	r := size * 7 / 36
	ring := size / 18
	cx, cy := size-r-size/36, size-r-size/36
	const ss = 4
	for y := 0; y < img.Bounds().Dy(); y++ {
		for x := 0; x < img.Bounds().Dx(); x++ {
			var dot, clear float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					d := math.Hypot(float64(x)+(float64(sx)+0.5)/ss-cx, float64(y)+(float64(sy)+0.5)/ss-cy)
					if d <= r {
						dot++
					} else if d <= r+ring {
						clear++
					}
				}
			}
			if dot+clear == 0 {
				continue
			}
			p := img.NRGBAAt(x, y)
			// Ring and dot both punch out the glyph; the dot then paints over it.
			keep := 1 - (dot+clear)/(ss*ss)
			a := float64(p.A) * keep
			da := dot / (ss * ss)
			outA := a + 255*da
			if outA == 0 {
				img.SetNRGBA(x, y, color.NRGBA{})
				continue
			}
			mix := func(g, d uint8) uint8 { return uint8((float64(g)*a + float64(d)*255*da) / outA) }
			img.SetNRGBA(x, y, color.NRGBA{mix(p.R, c.R), mix(p.G, c.G), mix(p.B, c.B), uint8(outA + 0.5)})
		}
	}
}
