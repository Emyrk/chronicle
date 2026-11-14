package creatures

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const GraphStateVersion uint32 = 1

type graphState struct {
	CurrentZone  zone.Zone                           `json:"current_zone"`
	ZonedUnits   map[string]map[uint32]string        `json:"zoned_units"`
	UnitQuantity map[uint32]map[guid.GUID]struct{}   `json:"unit_quantity"`
	ZoneSpells   map[string]map[chrondbc.SpellID]int `json:"zone_spells"`
	UnknownUnits map[string]map[uint32]int           `json:"unknown_units"`
	UnitSpells   map[uint32]map[string]struct{}      `json:"unit_spells"`
	Units        string                              `json:"units"`
}

// RegisterGraphOwner preserves the identity collector's own canonical Units.
// It intentionally does not substitute encounter Units or retain message references.
func RegisterGraphOwner(r *ownergraph.Registry) error {
	validate := func(c *Creatures) error {
		if c.Units == nil || c.ZonedUnits == nil || c.UnitQuantity == nil || c.ZoneSpells == nil || c.UnknownUnits == nil || c.UnitSpells == nil {
			return fmt.Errorf("incomplete identity collector state")
		}
		return nil
	}
	return ownergraph.Register(r, ownergraph.Codec[Creatures]{Type: "creatures.identity", Version: GraphStateVersion, Init: func() *Creatures { return new(Creatures) },
		Capture: func(c *Creatures, ctx *ownergraph.Capture) ([]byte, error) {
			if err := validate(c); err != nil {
				return nil, err
			}
			ref, err := ctx.Ref(c.Units)
			if err != nil {
				return nil, err
			}
			return json.Marshal(graphState{c.CurrentZone, c.ZonedUnits, c.UnitQuantity, c.ZoneSpells, c.UnknownUnits, c.UnitSpells, ref})
		}, Restore: func(c *Creatures, version uint32, b []byte, ctx *ownergraph.Restore) error {
			if version != GraphStateVersion {
				return fmt.Errorf("unsupported identity version %d", version)
			}
			var s graphState
			if err := decodeGraph(b, &s); err != nil {
				return err
			}
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(b, &fields); err != nil {
				return err
			}
			if len(fields) != 7 || bytes.Equal(fields["current_zone"], []byte("null")) {
				return fmt.Errorf("incomplete identity fields")
			}
			units, err := ownergraph.Loader[*unitdb.Units](ctx)(s.Units)
			if err != nil {
				return err
			}
			*c = Creatures{CurrentZone: s.CurrentZone, ZonedUnits: s.ZonedUnits, UnitQuantity: s.UnitQuantity, ZoneSpells: s.ZoneSpells, UnknownUnits: s.UnknownUnits, UnitSpells: s.UnitSpells, Units: units, graphPending: true}
			return validate(c)
		}, Validate: validate})
}

func (c *Creatures) ValidateGraphRuntime(logger *slog.Logger) error {
	if c == nil || !c.graphPending || logger == nil {
		return fmt.Errorf("identity collector is not awaiting valid runtime wiring")
	}
	return nil
}
func (c *Creatures) WireGraphRuntime(logger *slog.Logger) error {
	if err := c.ValidateGraphRuntime(logger); err != nil {
		return err
	}
	c.logger = logger
	c.graphPending = false
	return nil
}

// Reject duplicate keys as well as unknown fields, missing fields and trailing data.
func decodeGraph(b []byte, out any) error {
	var check func(*json.Decoder) error
	check = func(d *json.Decoder) error {
		token, err := d.Token()
		if err != nil {
			return err
		}
		delim, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				key, err := d.Token()
				if err != nil {
					return err
				}
				k := key.(string)
				if seen[k] {
					return fmt.Errorf("duplicate field %s", k)
				}
				seen[k] = true
				if err := check(d); err != nil {
					return err
				}
			}
		case '[':
			for d.More() {
				if err := check(d); err != nil {
					return err
				}
			}
		default:
			return fmt.Errorf("invalid JSON delimiter")
		}
		_, err = d.Token()
		return err
	}
	d := json.NewDecoder(bytes.NewReader(b))
	if err := check(d); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	d = json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	return d.Decode(out)
}
