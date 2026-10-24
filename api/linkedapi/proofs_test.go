package linkedapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func TestValidateJPEG(t *testing.T) {
	t.Parallel()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name  string
		data  []byte
		valid bool
	}{
		{"valid JPEG", buf.Bytes(), true},
		{"fake header", []byte{0xff, 0xd8, 0xff, 0, 0, 0}, false},
		{"truncated", buf.Bytes()[:len(buf.Bytes())/2], false},
		{"oversized", make([]byte, maxProofImage+1), false},
		{"empty", nil, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := validateJPEG(test.data) == nil; got != test.valid {
				t.Errorf("valid=%v, want %v", got, test.valid)
			}
		})
	}
}
