package main

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
)

var allStates = []engine.State{engine.StateIdle, engine.StateNoLog, engine.StateWaiting,
	engine.StateRecording, engine.StateUploading, engine.StateUploaded, engine.StateReconnect}

func nrgbaAt(img image.Image, x, y int) color.NRGBA {
	return color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
}

// checkSwirl asserts that every fully opaque mask pixel carries the state
// colour, and that the former dot corner holds no state colour.
func checkSwirl(t *testing.T, s engine.State, img image.Image, mask image.Image, msg string) {
	t.Helper()
	want := stateColors[s]
	n := 0
	b := mask.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if nrgbaAt(mask, x, y).A == 255 {
				n++
				require.Equal(t, want, nrgbaAt(img, x, y), "%s: spiral pixel (%d,%d)", msg, x, y)
			}
		}
	}
	require.NotZero(t, n, "%s: no opaque spiral pixel", msg)

	size := b.Dx()
	c := size * 28 / 36 // former dot centre
	got := nrgbaAt(img, c, c)
	for st, sc := range stateColors {
		require.False(t, got.A > 0 && got == sc, "%s: corner is state colour of %v", msg, st)
	}
}

func TestTrayIconSwirlCarriesState(t *testing.T) {
	t.Parallel()
	masks := map[int][]byte{16: swirlMask16, 32: swirlMask32, 36: swirlMask36}
	for _, s := range allStates {
		require.NotEmpty(t, trayIcon(s), "state %v", s)
		for _, dark := range []bool{false, true} {
			for _, i := range buildIcons(s, dark) {
				img, err := png.Decode(bytes.NewReader(i.data))
				require.NoError(t, err)
				checkSwirl(t, s, img, decodePNG(masks[i.size]), "buildIcons")
			}
		}
		// The macOS path, whatever platform the tests run on.
		for _, body := range [][]byte{stoneBlack, stoneWhite} {
			checkSwirl(t, s, swirlOnBody(body, swirlMask36, stateColors[s]), decodePNG(swirlMask36), "mono")
		}
	}
}

// TestContactSheet writes the proof sheet to $UPLOADER_ICON_SHEET: six states
// (uploaded shares green with recording) on a light and a dark menu bar, at
// 36 px and at 4x. Skipped unless the variable is set; not committed.
func TestContactSheet(t *testing.T) {
	path := os.Getenv("UPLOADER_ICON_SHEET")
	if path == "" {
		t.Skip("UPLOADER_ICON_SHEET not set")
	}
	states := []engine.State{engine.StateIdle, engine.StateNoLog, engine.StateWaiting,
		engine.StateRecording, engine.StateUploading, engine.StateReconnect}
	const cell, pad = 36 * 4, 12
	w := pad + len(states)*(cell+pad)
	rowH := 36 + pad + cell + pad
	sheet := image.NewNRGBA(image.Rect(0, 0, w, 2*rowH))
	bars := []struct {
		bg   color.NRGBA
		body []byte
	}{
		{color.NRGBA{0xe6, 0xe6, 0xe6, 0xff}, stoneBlack},
		{color.NRGBA{0x2b, 0x2b, 0x2b, 0xff}, stoneWhite},
	}
	for r, bar := range bars {
		draw.Draw(sheet, image.Rect(0, r*rowH, w, (r+1)*rowH), image.NewUniform(bar.bg), image.Point{}, draw.Src)
		for i, s := range states {
			icon := swirlOnBody(bar.body, swirlMask36, stateColors[s])
			x := pad + i*(cell+pad)
			y := r * rowH
			draw.Draw(sheet, image.Rect(x, y+pad/2, x+36, y+pad/2+36), icon, image.Point{}, draw.Over)
			big := image.Rect(x, y+36+pad, x+cell, y+36+pad+cell)
			for py := 0; py < cell; py++ {
				for px := 0; px < cell; px++ {
					p := nrgbaAt(icon, px/4, py/4)
					draw.Draw(sheet, image.Rect(big.Min.X+px, big.Min.Y+py, big.Min.X+px+1, big.Min.Y+py+1), image.NewUniform(p), image.Point{}, draw.Over)
				}
			}
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, sheet))
	require.NoError(t, os.WriteFile(path, buf.Bytes(), 0o644))
}
