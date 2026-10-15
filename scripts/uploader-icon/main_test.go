package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEncodeDeterministicAndDecodable(t *testing.T) {
	t.Parallel()
	// Wide enough that the raw data spans several stored deflate blocks.
	img := image.NewNRGBA(image.Rect(0, 0, 300, 90))
	for y := 0; y < 90; y++ {
		for x := 0; x < 300; x++ {
			img.SetNRGBA(x, y, color.NRGBA{uint8(x), uint8(y), uint8(x ^ y), uint8(x + y)})
		}
	}
	a, b := encode(img), encode(img)
	require.True(t, bytes.Equal(a, b))

	got, err := png.Decode(bytes.NewReader(a))
	require.NoError(t, err)
	nrgba, ok := got.(*image.NRGBA)
	require.True(t, ok)
	require.Equal(t, img.Pix, nrgba.Pix)
}

func TestSwirlMaskAndBodyAreSeparate(t *testing.T) {
	t.Parallel()
	svg, err := os.ReadFile("../../cmd/uploader/packaging/stone.svg")
	require.NoError(t, err)
	s := parseStone(string(svg))
	mask := s.swirlMask(36)
	body := s.body(36, nil)
	spiral := 0
	for y := 0; y < 36; y++ {
		for x := 0; x < 36; x++ {
			if mask.NRGBAAt(x, y).A == 255 {
				spiral++
				// The body never carries the spiral's blue.
				require.NotEqual(t, s.spiralColor, rgb{float64(body.NRGBAAt(x, y).R), float64(body.NRGBAAt(x, y).G), float64(body.NRGBAAt(x, y).B)})
			}
		}
	}
	require.NotZero(t, spiral)
}
