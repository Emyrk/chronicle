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
	"hash/adler32"
	"hash/crc32"
	"image"
	"image/color"
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

// ellipse is one face of the stone.
type ellipse struct {
	cx, cy, rx, ry float64
	half           float64 // half stroke width
	fill, edge     rgb
}

// stone is the parsed SVG: a side-face ellipse, a top-face ellipse and a spiral
// polyline in a group rotated around (rcx, rcy). Coordinates are in the 64x64
// viewBox.
type stone struct {
	side, top   ellipse
	rcx, rcy    float64
	cos, sin    float64 // inverse rotation
	spiralHalf  float64
	spiralColor rgb
	spiral      [][2]float64
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

func parseEllipse(e string) ellipse {
	return ellipse{
		cx: num(attr(e, "cx")), cy: num(attr(e, "cy")),
		rx: num(attr(e, "rx")), ry: num(attr(e, "ry")),
		half: num(attr(e, "stroke-width")) / 2,
		fill: hex(attr(e, "fill")), edge: hex(attr(e, "stroke")),
	}
}

func parseStone(svg string) *stone {
	g := regexp.MustCompile(`<g [^>]*>`).FindString(svg)
	ells := regexp.MustCompile(`<ellipse [^>]*>`).FindAllString(svg, -1)
	pol := regexp.MustCompile(`<polyline [^>]*>`).FindString(svg)
	if len(ells) != 2 {
		log.Fatal("stone.svg: want exactly two ellipses (side, top)")
	}
	rot := strings.Fields(strings.NewReplacer("rotate(", "", ")", "").Replace(attr(g, "transform")))
	if len(rot) != 3 {
		log.Fatal("stone.svg: transform must be rotate(angle cx cy)")
	}
	a := num(rot[0]) * math.Pi / 180
	s := &stone{
		side: parseEllipse(ells[0]), top: parseEllipse(ells[1]),
		rcx: num(rot[1]), rcy: num(rot[2]),
		cos: math.Cos(-a), sin: math.Sin(-a),
		spiralHalf:  num(attr(pol, "stroke-width")) / 2,
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

// paint returns the ellipse's stroke or fill colour at (x, y), and whether the
// point is on the stroke.
func (e ellipse) paint(x, y float64) (c rgb, ok, stroke bool) {
	ex, ey := x-e.cx, y-e.cy
	f := ex*ex/(e.rx*e.rx) + ey*ey/(e.ry*e.ry)
	grad := math.Hypot(2*ex/(e.rx*e.rx), 2*ey/(e.ry*e.ry))
	if grad > 0 && math.Abs(f-1)/grad <= e.half {
		return e.edge, true, true
	}
	if f < 1 {
		return e.fill, true, false
	}
	return rgb{}, false, false
}

// at returns the paint at viewBox point (x, y). With mono set, the top face's
// fill is transparent (so only its outline and the spiral show) and the side
// face is solid; callers recolour the result.
func (s *stone) at(x, y float64, mono bool) (rgb, bool) {
	// Into the ellipses' frame.
	dx, dy := x-s.rcx, y-s.rcy
	x, y = s.rcx+dx*s.cos-dy*s.sin, s.rcy+dx*s.sin+dy*s.cos
	if math.Hypot(x-s.top.cx, y-s.top.cy) < 20 {
		for i := 1; i < len(s.spiral); i++ {
			if segDist(x, y, s.spiral[i-1], s.spiral[i]) <= s.spiralHalf {
				return s.spiralColor, true
			}
		}
	}
	if c, ok, stroke := s.top.paint(x, y); ok && (stroke || !mono) {
		return c, true
	} else if ok {
		return rgb{}, false // mono: the top face hides the side face behind it
	}
	c, ok, _ := s.side.paint(x, y)
	return c, ok
}

const ss = 4

// glyph renders the stone alone at size x size. A non-nil mono renders it in
// that single colour, with alpha only.
func (s *stone) glyph(size int, mono *rgb) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var c rgb
			var n float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					u := (float64(x) + (float64(sx)+0.5)/ss) * 64 / float64(size)
					v := (float64(y) + (float64(sy)+0.5)/ss) * 64 / float64(size)
					p, ok := s.at(u, v, mono != nil)
					if !ok {
						continue
					}
					if mono != nil {
						p = *mono
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

// encode writes img as an 8-bit RGBA PNG with every byte hand-framed (filter 0,
// one IDAT of stored deflate blocks), so output does not depend on the Go
// version's image/png or compress/zlib.
func encode(img *image.NRGBA) []byte {
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	raw := make([]byte, 0, h*(1+4*w))
	for y := 0; y < h; y++ {
		raw = append(raw, 0) // filter: none
		raw = append(raw, img.Pix[y*img.Stride:y*img.Stride+4*w]...)
	}

	// zlib: header, stored blocks (<= 65535 bytes), adler32.
	z := []byte{0x78, 0x01}
	for off := 0; ; {
		n := min(len(raw)-off, 65535)
		final := byte(0)
		if off+n == len(raw) {
			final = 1
		}
		z = append(z, final, byte(n), byte(n>>8), ^byte(n), ^byte(n>>8))
		z = append(z, raw[off:off+n]...)
		off += n
		if final == 1 {
			break
		}
	}
	z = binary.BigEndian.AppendUint32(z, adler32.Checksum(raw))

	var out bytes.Buffer
	out.WriteString("\x89PNG\r\n\x1a\n")
	chunk := func(typ string, data []byte) {
		_ = binary.Write(&out, binary.BigEndian, uint32(len(data)))
		start := out.Len()
		out.WriteString(typ)
		out.Write(data)
		_ = binary.Write(&out, binary.BigEndian, crc32.ChecksumIEEE(out.Bytes()[start:]))
	}
	ihdr := binary.BigEndian.AppendUint32(nil, uint32(w))
	ihdr = binary.BigEndian.AppendUint32(ihdr, uint32(h))
	ihdr = append(ihdr, 8, 6, 0, 0, 0) // 8-bit, RGBA, deflate, filter 0, no interlace
	chunk("IHDR", ihdr)
	chunk("IDAT", z)
	chunk("IEND", nil)
	return out.Bytes()
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
		"stone_black_36.png": encode(s.glyph(36, &rgb{0, 0, 0})),       // macOS, light menu bar (18 pt @2x)
		"stone_white_36.png": encode(s.glyph(36, &rgb{255, 255, 255})), // macOS, dark menu bar
		"stone_color_16.png": encode(s.glyph(16, nil)),
		"stone_color_32.png": encode(s.glyph(32, nil)),
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
