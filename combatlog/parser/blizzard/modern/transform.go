package modern

import (
	next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
	"io"
	"time"
)

type transformReader struct {
	*next.TransformReader
	guids *guidNormalizer
}

func wrapTransform(r *next.TransformReader) *transformReader {
	return &transformReader{TransformReader: r, guids: &guidNormalizer{r.GUIDs()}}
}
func newTransformReader(r io.Reader) *transformReader {
	return wrapTransform(next.NewTransformReader(r))
}
func newHermesProxyTransformReader(r io.Reader) *transformReader {
	return wrapTransform(next.NewHermesProxyTransformReader(r))
}
func (r *transformReader) transform(line string) (string, error) { return r.Transform(line) }
func parseTimestamp(raw string) (time.Time, error)               { return next.ParseTimestamp(raw) }
func splitTopLevel(raw string) []string                          { return next.SplitTopLevel(raw) }
