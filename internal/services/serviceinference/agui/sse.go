package agui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
)

// Writer serializes AG-UI events as server-sent event frames.
type Writer struct {
	writer io.Writer
	flush  func() error
	nextID uint64
}

// NewWriter creates an SSE writer for an HTTP response and sets the standard
// streaming response headers. Flush failures are returned from Write.
func NewWriter(w http.ResponseWriter) *Writer {
	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache")
	header.Set("X-Accel-Buffering", "no")
	return NewStreamWriter(w, http.NewResponseController(w).Flush)
}

// NewStreamWriter creates an SSE writer around arbitrary testable primitives.
// A nil flush function disables flushing.
func NewStreamWriter(w io.Writer, flush func() error) *Writer {
	return &Writer{writer: w, flush: flush, nextID: 1}
}

// Write writes and flushes one complete SSE frame. IDs are monotonically
// increasing within this writer, starting at 1.
func (w *Writer) Write(event Event) error {
	if event == nil {
		return errors.New("AG-UI event is nil")
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal AG-UI event: %w", err)
	}
	payload, err = addEventType(payload, event.EventType())
	if err != nil {
		return err
	}

	id := w.nextID
	w.nextID++
	var frame bytes.Buffer
	frame.WriteString("id: ")
	frame.WriteString(strconv.FormatUint(id, 10))
	frame.WriteByte('\n')
	frame.WriteString("event: ")
	frame.WriteString(string(event.EventType()))
	frame.WriteByte('\n')
	frame.WriteString("data: ")
	frame.Write(payload)
	frame.WriteString("\n\n")
	if _, err := w.writer.Write(frame.Bytes()); err != nil {
		return fmt.Errorf("write AG-UI event: %w", err)
	}
	if w.flush != nil {
		if err := w.flush(); err != nil {
			return fmt.Errorf("flush AG-UI event: %w", err)
		}
	}
	return nil
}

func addEventType(payload []byte, eventType EventType) ([]byte, error) {
	if len(payload) == 0 || payload[0] != '{' {
		return nil, errors.New("marshal AG-UI event: event is not a JSON object")
	}
	typeField, err := json.Marshal(eventType)
	if err != nil {
		return nil, fmt.Errorf("marshal AG-UI event type: %w", err)
	}
	result := make([]byte, 0, len(payload)+len(typeField)+8)
	result = append(result, '{')
	result = append(result, `"type":`...)
	result = append(result, typeField...)
	if len(payload) > 2 {
		result = append(result, ',')
		result = append(result, payload[1:]...)
	} else {
		result = append(result, '}')
	}
	return result, nil
}
