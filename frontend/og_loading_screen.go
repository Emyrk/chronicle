package frontend

import (
	"bytes"
	"image"
	"image/draw"
	"image/jpeg"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"

	_ "golang.org/x/image/webp"
)

const ogLoadingScreenAspectWidth = 3
const ogLoadingScreenAspectHeight = 2

// serveOGLoadingScreen serves a 3:2 center crop matching the artwork framing on
// Recent raid cards. Social clients cannot apply the card's CSS object-fit crop,
// so the Open Graph image needs a separately rendered asset.
func (h *handler) serveOGLoadingScreen(resp http.ResponseWriter, req *http.Request) bool {
	requestPath := path.Clean(req.URL.Path)
	if !strings.HasPrefix(requestPath, ogLoadingScreenPrefix) {
		return false
	}

	filename := strings.TrimPrefix(requestPath, ogLoadingScreenPrefix)
	if filename == "" || path.Base(filename) != filename || !strings.HasSuffix(filename, ".jpg") {
		http.NotFound(resp, req)
		return true
	}

	sourceName := strings.TrimSuffix(filename, ".jpg") + ".webp"
	sourcePath := strings.TrimPrefix(loadingScreenPrefix, "/") + sourceName
	source, err := fs.ReadFile(h.fs, sourcePath)
	if err != nil {
		http.NotFound(resp, req)
		return true
	}

	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		http.Error(resp, "failed to decode loading screen", http.StatusInternalServerError)
		return true
	}

	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, cropToAspect(decoded, ogLoadingScreenAspectWidth, ogLoadingScreenAspectHeight), &jpeg.Options{Quality: 90}); err != nil {
		http.Error(resp, "failed to encode loading screen", http.StatusInternalServerError)
		return true
	}

	resp.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	resp.Header().Set("Content-Type", "image/jpeg")
	resp.Header().Set("Content-Length", strconv.Itoa(encoded.Len()))
	_, _ = resp.Write(encoded.Bytes())
	return true
}

func cropToAspect(source image.Image, aspectWidth, aspectHeight int) image.Image {
	bounds := source.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	cropWidth := width
	cropHeight := height

	if width*aspectHeight > height*aspectWidth {
		cropWidth = height * aspectWidth / aspectHeight
	} else {
		cropHeight = width * aspectHeight / aspectWidth
	}

	cropBounds := image.Rect(0, 0, cropWidth, cropHeight)
	cropped := image.NewRGBA(cropBounds)
	sourcePoint := image.Pt(
		bounds.Min.X+(width-cropWidth)/2,
		bounds.Min.Y+(height-cropHeight)/2,
	)
	draw.Draw(cropped, cropBounds, source, sourcePoint, draw.Src)
	return cropped
}
