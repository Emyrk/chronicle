package synthetic

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// decodeSyntheticValue requires the complete captured shape, including explicit
// nil representations, while rejecting duplicate/unknown fields and trailing data.
func decodeSyntheticValue(payload []byte, value any) error {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("trailing character state")
	}
	expected, err := json.Marshal(value)
	if err != nil {
		return err
	}
	a, err := syntheticJSON(payload)
	if err != nil {
		return err
	}
	b, err := syntheticJSON(expected)
	if err != nil {
		return err
	}
	if !bytes.Equal(a, b) {
		return fmt.Errorf("incomplete character state")
	}
	return nil
}
func syntheticJSON(payload []byte) ([]byte, error) {
	d := json.NewDecoder(bytes.NewReader(payload))
	d.UseNumber()
	var read func() (any, error)
	read = func() (any, error) {
		token, err := d.Token()
		if err != nil {
			return nil, err
		}
		switch token {
		case json.Delim('{'):
			v := map[string]any{}
			for d.More() {
				token, err := d.Token()
				if err != nil {
					return nil, err
				}
				key := token.(string)
				if _, ok := v[key]; ok {
					return nil, fmt.Errorf("duplicate character field")
				}
				child, err := read()
				if err != nil {
					return nil, err
				}
				v[key] = child
			}
			_, err = d.Token()
			return v, err
		case json.Delim('['):
			v := []any{}
			for d.More() {
				child, err := read()
				if err != nil {
					return nil, err
				}
				v = append(v, child)
			}
			_, err = d.Token()
			return v, err
		default:
			return token, nil
		}
	}
	value, err := read()
	if err != nil {
		return nil, err
	}
	return json.Marshal(value)
}
