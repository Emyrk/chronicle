package rankings

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// decodeGraphEnvelope rejects missing, duplicate, unknown and null fields.
func decodeGraphEnvelope(b []byte, names ...string) error {
	d := json.NewDecoder(bytes.NewReader(b))
	tok, err := d.Token()
	if err != nil {
		return err
	}
	if tok != json.Delim('{') {
		return fmt.Errorf("graph envelope must be an object")
	}
	fields := map[string]json.RawMessage{}
	for d.More() {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		name := tok.(string)
		if _, ok := fields[name]; ok {
			return fmt.Errorf("duplicate graph field %q", name)
		}
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return err
		}
		fields[name] = raw
	}
	if _, err := d.Token(); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing graph envelope")
	}
	if len(fields) != len(names) {
		return fmt.Errorf("invalid graph envelope fields")
	}
	for _, name := range names {
		v, ok := fields[name]
		if !ok || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			return fmt.Errorf("missing or null graph field %q", name)
		}
	}
	return nil
}
