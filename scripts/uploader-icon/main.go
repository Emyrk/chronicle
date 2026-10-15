// Command uploader-icon renders the Chronicle Uploader stone glyph from its
// SVG master (cmd/uploader/packaging/stone.svg) into the committed tray PNGs
// and the app icon (.icns: the stone on a gold-to-brown gradient square).
//
// It is a tiny rasteriser, not a general SVG renderer: it reads the <ellipse>,
// <polyline> and the group's rotate() transform and stroke-width, which is all
// the stone uses. Output is deterministic so re-running it is a no-op.
//
// Usage: go run ./scripts/uploader-icon <stone.svg> <tray-dir> <AppIcon.icns>
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	gold  = [3]float64{0xe6, 0xb4, 0x2c}
	brown = [3]float64{0x5a, 0x34, 0x17}
)

type rgb = [3]float64

// stone is the parsed SVG: an ellipse and a spiral polyline in a group that is
// rotated by angle around (rcx, rcy). All coordinates are in the 64x64 viewBox.
type stone struct {
	cx, cy, rx, ry float64
	rcx, rcy       float64
	cos, sin       float64 // inverse rotation
	half           float64 // half stroke width
	fill, edge     rgb
	spiralColor    rgb
	spiral         [][2]float64
}

func attr(s, name string) string {
	m := regexp.MustCompile(`\b` + name + `="([^"]*)"`).FindStringSubmatch(s)
	if m == nil {
		log.Fatalf("stone.svg: missing %s", name)
	}
	return m[1]
}

func num(s string) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		log.Fatal(err)
	}
	return f
}

func hex(s string) rgb {
	var r, g, b int
	if _, err := fmt.Sscanf(s, "#%02x%02x%02x", &r, &g, &b); err != nil {
		log.Fatalf("stone.svg: bad colour %q", s)
	}
	return rgb{float64(r), float64(g), float64(b)}
}

func parseStone(svg string) *stone {
	g := regexp.MustCompile(`<g [^>]*>`).FindString(svg)
	ell := regexp.MustCompile(`<ellipse [^>]*>`).FindString(svg)
	pol := regexp.MustCompile(`<polyline [^>]*>`).FindString(svg)
	rot := strings.Fields(strings.NewReplacer("rotate(", "", ")", "").Replace(attr(g, "transform")))
	if len(rot) != 3 {
		log.Fatal("stone.svg: transform must be rotate(angle cx cy)")
	}
	a := num(rot[0]) * math.Pi / 180
	s := &stone{
		cx: num(attr(ell, "cx")), cy: num(attr(ell, "cy")),
		rx: num(attr(ell, "rx")), ry: num(attr(ell, "ry")),
		rcx: num(rot[1]), rcy: num(rot[2]),
		cos: math.Cos(-a), sin: math.Sin(-a),
		half: num(attr(g, "stroke-width")) / 2,
		fill: hex(attr(ell, "fill")), edge: hex(attr(ell, "stroke")),
		spiralColor: hex(attr(pol, "stroke")),
	}
	for _, p := range strings.Fields(attr(pol, "points")) {
		xy := strings.Split(p, ",")
		s.spiral = append(s.spiral, [2]float64{num(xy[0]), num(xy[1])})
	}
	return s
}

func segDist(px, py float64, a, b [2]float64) float64 {
	dx, dy := b[0]-a[0], b[1]-a[1]
	t := ((px-a[0])*dx + (py-a[1])*dy) / (dx*dx + dy*dy)
	t = math.Max(0, math.Min(1, t))
	return math.Hypot(px-a[0]-t*dx, py-a[1]-t*dy)
}

// at returns the paint at viewBox point (x, y). In template mode the glyph is
// outline + spiral only (fill is transparent so the spiral stays readable).
func (s *stone) at(x, y float64, template bool) (rgb, bool) {
	// Into the ellipse's frame.
	dx, dy := x-s.rcx, y-s.rcy
	x, y = s.rcx+dx*s.cos-dy*s.sin, s.rcy+dx*s.sin+dy*s.cos
	for i := 1; i < len(s.spiral) && math.Hypot(x-s.cx, y-s.cy) < 18; i++ {
		if segDist(x, y, s.spiral[i-1], s.spiral[i]) <= s.half {
			return s.spiralColor, true
		}
	}
	ex, ey := x-s.cx, y-s.cy
	f := ex*ex/(s.rx*s.rx) + ey*ey/(s.ry*s.ry)
	grad := math.Hypot(2*ex/(s.rx*s.rx), 2*ey/(s.ry*s.ry))
	if grad > 0 && math.Abs(f-1)/grad <= s.half {
		return s.edge, true
	}
	if f < 1 && !template {
		return s.fill, true
	}
	return rgb{}, false
}

const ss = 4

// glyph renders the stone alone at size x size. Template glyphs are black with
// alpha only.
func (s *stone) glyph(size int, template bool) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var c rgb
			var n float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					u := (float64(x) + (float64(sx)+0.5)/ss) * 64 / float64(size)
					v := (float64(y) + (float64(sy)+0.5)/ss) * 64 / float64(size)
					p, ok := s.at(u, v, template)
					if !ok {
						continue
					}
					if template {
						p = rgb{}
					}
					for i := range c {
						c[i] += p[i]
					}
					n++
				}
			}
			if n == 0 {
				continue
			}
			img.SetNRGBA(x, y, color.NRGBA{uint8(c[0]/n + 0.5), uint8(c[1]/n + 0.5), uint8(c[2]/n + 0.5), uint8(255*n/(ss*ss) + 0.5)})
		}
	}
	return img
}

// appIcon draws the stone on the gold gradient rounded square.
func (s *stone) appIcon(size int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	const half, rad = 0.41, 0.18 // macOS icon grid: square covers 82% of the canvas
	const span = 0.70            // the 64-unit viewBox covers 70% of the canvas
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var c rgb
			var a float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					u := (float64(x) + (float64(sx)+0.5)/ss) / float64(size)
					v := (float64(y) + (float64(sy)+0.5)/ss) / float64(size)
					dx := math.Max(math.Abs(u-0.5)-(half-rad), 0)
					dy := math.Max(math.Abs(v-0.5)-(half-rad), 0)
					if dx*dx+dy*dy > rad*rad {
						continue
					}
					t := (u + v) / 2
					p := rgb{}
					for i := range p {
						p[i] = gold[i]*(1-t) + brown[i]*t
					}
					if q, ok := s.at(32+(u-0.5)/span*64, 32+(v-0.5)/span*64, false); ok {
						p = q
					}
					for i := range c {
						c[i] += p[i]
					}
					a++
				}
			}
			if a > 0 {
				img.SetNRGBA(x, y, color.NRGBA{uint8(c[0]/a + 0.5), uint8(c[1]/a + 0.5), uint8(c[2]/a + 0.5), uint8(255*a/(ss*ss) + 0.5)})
			}
		}
	}
	return img
}

func encode(img image.Image) []byte {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		log.Fatal(err)
	}
	return buf.Bytes()
}

func main() {
	if len(os.Args) != 4 {
		log.Fatal("usage: uploader-icon <stone.svg> <tray-dir> <AppIcon.icns>")
	}
	svg, err := os.ReadFile(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	s := parseStone(string(svg))

	trayDir := os.Args[2]
	outputs := map[string][]byte{
		"stone_template_18.png": encode(s.glyph(36, true)), // 18 pt @2x
		"stone_color_16.png":    encode(s.glyph(16, false)),
		"stone_color_32.png":    encode(s.glyph(32, false)),
	}
	for name, data := range outputs {
		if err := os.WriteFile(filepath.Join(trayDir, name), data, 0o644); err != nil {
			log.Fatal(err)
		}
	}

	// PNG-payload icns types: ic07=128, ic08=256, ic09=512, ic10=1024.
	types := []struct {
		tag  string
		size int
	}{{"ic07", 128}, {"ic08", 256}, {"ic09", 512}, {"ic10", 1024}}
	var body bytes.Buffer
	for _, t := range types {
		data := encode(s.appIcon(t.size))
		body.WriteString(t.tag)
		_ = binary.Write(&body, binary.BigEndian, uint32(8+len(data)))
		body.Write(data)
	}
	var out bytes.Buffer
	out.WriteString("icns")
	_ = binary.Write(&out, binary.BigEndian, uint32(8+body.Len()))
	out.Write(body.Bytes())
	if err := os.WriteFile(os.Args[3], out.Bytes(), 0o644); err != nil {
		log.Fatal(err)
	}
}
