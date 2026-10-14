// Command uploader-icon renders the Chronicle Uploader app icon (a quill on a
// gold-to-brown gradient) and writes it as an .icns file.
// Usage: go run ./scripts/uploader-icon <out.icns>
package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"os"
)

var (
	gold  = [3]float64{0xe6, 0xb4, 0x2c}
	brown = [3]float64{0x5a, 0x34, 0x17}
)

// render draws the icon at size x size with 3x3 supersampling.
func render(size int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	const ss = 3
	s := float64(size)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var r, g, b, a float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					u := (float64(x) + (float64(sx)+0.5)/ss) / s
					v := (float64(y) + (float64(sy)+0.5)/ss) / s
					c, ok := shade(u, v)
					if !ok {
						continue
					}
					r += c[0]
					g += c[1]
					b += c[2]
					a++
				}
			}
			if a == 0 {
				continue
			}
			img.SetNRGBA(x, y, color.NRGBA{uint8(r / a), uint8(g / a), uint8(b / a), uint8(255 * a / (ss * ss))})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		log.Fatal(err)
	}
	return buf.Bytes()
}

// shade returns the colour at unit-square coords (u,v), or false if outside.
func shade(u, v float64) ([3]float64, bool) {
	// Rounded square covering 82% of the canvas (macOS icon grid margin).
	const half, rad = 0.41, 0.18
	dx := math.Max(math.Abs(u-0.5)-(half-rad), 0)
	dy := math.Max(math.Abs(v-0.5)-(half-rad), 0)
	if dx*dx+dy*dy > rad*rad {
		return [3]float64{}, false
	}
	t := (u + v) / 2 // diagonal gradient, gold top-left to brown bottom-right
	c := [3]float64{}
	for i := range c {
		c[i] = gold[i]*(1-t) + brown[i]*t
	}
	// Rotate into quill space: p along the feather (bottom-left -> top-right).
	px, py := u-0.5, v-0.5
	p := (px - py) / math.Sqrt2
	q := (px + py) / math.Sqrt2
	// Feather vane: ellipse offset toward the tip.
	ep, eq := (p-0.04)/0.27, q/0.085
	if ep*ep+eq*eq <= 1 {
		c = [3]float64{0xfb, 0xf3, 0xdc}
	}
	// Shaft: thin line from the vane to a point below-left.
	if p > -0.30 && p < 0.30 && math.Abs(q) < 0.010 {
		c = [3]float64{0x3a, 0x20, 0x0c}
	}
	if p <= -0.23 && p > -0.30 && math.Abs(q) < 0.014 {
		c = [3]float64{0x3a, 0x20, 0x0c}
	}
	return c, true
}

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: uploader-icon <out.icns>")
	}
	// PNG-payload icns types: ic07=128, ic08=256, ic09=512, ic10=1024.
	types := []struct {
		tag  string
		size int
	}{{"ic07", 128}, {"ic08", 256}, {"ic09", 512}, {"ic10", 1024}}
	var body bytes.Buffer
	for _, t := range types {
		data := render(t.size)
		body.WriteString(t.tag)
		_ = binary.Write(&body, binary.BigEndian, uint32(8+len(data)))
		body.Write(data)
	}
	var out bytes.Buffer
	out.WriteString("icns")
	_ = binary.Write(&out, binary.BigEndian, uint32(8+body.Len()))
	out.Write(body.Bytes())
	if err := os.WriteFile(os.Args[1], out.Bytes(), 0o644); err != nil {
		log.Fatal(err)
	}
}
