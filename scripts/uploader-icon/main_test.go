package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
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
