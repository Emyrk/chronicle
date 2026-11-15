package identitycatalog

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
)

const StateVersion uint32 = 1

// graphState contains only portable values. Runtime factories and registry pointers never cross this boundary.
type graphState struct {
	EventCount        int64                   `json:"event_count"`
	ZoneNameTruncated bool                    `json:"zone_name_truncated"`
	Configuration     string                  `json:"configuration"`
	Records           []Record                `json:"records"`
	Owners            map[guid.GUID]guid.GUID `json:"owners"`
	Zone              zone.Zone               `json:"zone"`
}

func configuration(reg *registry.Registry) string {
	if reg == nil {
		return "none"
	}
	type identity struct {
		Name        string
		Boss        bool
		Affiliation string
	}
	type entry struct {
		Name    string
		Zones   []string
		Entries map[uint32]identity
	}
	entries := map[string]entry{}
	for key, v := range reg.Entries() {
		e := entry{Name: v.Name, Zones: v.ZoneNames, Entries: map[uint32]identity{}}
		for id, i := range v.HostileEntries {
			e.Entries[id] = identity{i.Name, i.Boss, affiliation(i.Affiliation)}
		}
		entries[key] = e
	}
	b, _ := json.Marshal(entries)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}
func RegisterGraphOwner(r *ownergraph.Registry, reg *registry.Registry) error {
	return ownergraph.Register(r, ownergraph.Codec[Collector]{Type: "identitycatalog.Collector", Version: StateVersion, Init: func() *Collector { return New(reg) }, Capture: func(c *Collector, _ *ownergraph.Capture) ([]byte, error) {
		if c.reg != reg {
			return nil, fmt.Errorf("identitycatalog registry differs from trusted registration")
		}
		return json.Marshal(graphState{c.eventCount, c.zoneNameTruncated, configuration(reg), c.Records(), c.owners, c.zone})
	}, Restore: func(c *Collector, v uint32, b []byte, _ *ownergraph.Restore) error {
		if v != StateVersion {
			return fmt.Errorf("unsupported identitycatalog version %d", v)
		}
		var s graphState
		dec := json.NewDecoder(bytes.NewReader(b))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&s); err != nil {
			return err
		}
		if err := dec.Decode(new(any)); err != io.EOF {
			return fmt.Errorf("identitycatalog trailing data")
		}
		if s.Configuration != configuration(reg) {
			return fmt.Errorf("identitycatalog registry configuration mismatch")
		}
		if s.EventCount < 0 {
			return fmt.Errorf("invalid identitycatalog event count")
		}
		fresh := New(reg)
		fresh.eventCount = s.EventCount
		fresh.zoneNameTruncated = s.ZoneNameTruncated
		fresh.zone = s.Zone
		fresh.zoneKey = strings.ToLower(s.Zone.Name)
		for _, record := range s.Records {
			if _, ok := fresh.records[record.GUID]; ok {
				return fmt.Errorf("duplicate identitycatalog GUID")
			}
			if record.Observations < 1 || record.LastSeen.Before(record.FirstSeen) || len(record.Evidence) > EvidenceLimit || record.EvidenceOverflow < 0 || record.EvidenceTruncations < 0 {
				return fmt.Errorf("invalid identitycatalog record")
			}
			for _, e := range record.Evidence {
				if len(e.Name) > EvidenceStringLimit || len(e.Role) > EvidenceStringLimit || e.Observations < 1 || e.LastSeen.Before(e.FirstSeen) {
					return fmt.Errorf("invalid identitycatalog evidence")
				}
			}
			for _, ctx := range record.Contexts {
				if len(ctx.Zone) > EvidenceStringLimit || ctx.Observations < 1 || ctx.LastSeen.Before(ctx.FirstSeen) {
					return fmt.Errorf("invalid identitycatalog context")
				}
			}
			r := record
			fresh.records[r.GUID] = &r
		}
		for id, o := range s.Owners {
			if fresh.records[id] == nil || fresh.records[o] == nil {
				return fmt.Errorf("unobserved identitycatalog owner")
			}
			fresh.owners[id] = o
		}
		*c = *fresh
		return nil
	}})
}
