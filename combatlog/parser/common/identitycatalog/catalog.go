// Package identitycatalog collects diagnostic identity evidence without changing gameplay classification.
package identitycatalog

import (
	"context"
	"errors"
	"io"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/critters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/common/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/common/traps"
	"github.com/Emyrk/chronicle/combatlog/parser/common/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
)

const EvidenceLimit = 64

// Category vocabulary reserves mirror_image and treant; no unverified entry IDs are assigned.
const CategoryMirrorImage = "mirror_image"
const CategoryTreant = "treant"

type Record struct {
	GUID                guid.GUID  `json:"guid"`
	Entry               uint32     `json:"entry"`
	Kind                string     `json:"kind"`
	Category            string     `json:"category"`
	Affiliation         string     `json:"affiliation"`
	Recognition         string     `json:"recognition"`
	Unknown             bool       `json:"unknown"`
	Conflict            bool       `json:"conflict"`
	FirstSeen           time.Time  `json:"first_seen"`
	LastSeen            time.Time  `json:"last_seen"`
	Observations        int64      `json:"observations"`
	Contexts            []Context  `json:"contexts"`
	Evidence            []Evidence `json:"evidence"`
	EvidenceOverflow    int64      `json:"evidence_overflow"`
	EvidenceTruncations int64      `json:"evidence_truncations"`
}
type Context struct {
	Zone         string    `json:"zone"`
	MapID        uint32    `json:"map_id"`
	InstanceID   uint32    `json:"instance_id"`
	Category     string    `json:"category"`
	Affiliation  string    `json:"affiliation"`
	Recognition  string    `json:"recognition"`
	FirstSeen    time.Time `json:"first_seen"`
	LastSeen     time.Time `json:"last_seen"`
	Observations int64     `json:"observations"`
}
type Evidence struct {
	Role         string     `json:"role"`
	RelatedGUID  *guid.GUID `json:"related_guid,omitempty"`
	SpellID      int32      `json:"spell_id,omitempty"`
	Name         string     `json:"name,omitempty"`
	FirstSeen    time.Time  `json:"first_seen"`
	LastSeen     time.Time  `json:"last_seen"`
	Observations int64      `json:"observations"`
}

// instanceRule is an immutable scalar projection, never a runtime factory or callback.
type instanceRule struct{ Category, Affiliation string }
type Collector struct {
	zoneRules         map[string]map[uint32]instanceRule
	zoneKey           string
	eventCount        int64
	zoneNameTruncated bool
	reg               *registry.Registry
	records           map[guid.GUID]*Record
	owners            map[guid.GUID]guid.GUID
	zone              zone.Zone
}

var _ consumers.Consumer = (*Collector)(nil)

func New(reg *registry.Registry) *Collector {
	c := &Collector{reg: reg, records: make(map[guid.GUID]*Record), owners: make(map[guid.GUID]guid.GUID), zoneRules: make(map[string]map[uint32]instanceRule)}
	if reg == nil {
		return c
	}
	// Fail closed when multiple registrations claim a zone name. Creature entries
	// are not proof of which instance is active.
	// Build once; processing performs two map lookups, never registry scans/sorts.
	zoneOwners := make(map[string]string)
	ambiguousZones := make(map[string]bool)
	names := make([]string, 0, len(reg.Entries()))
	for name := range reg.Entries() {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		entry := reg.Entries()[name]
		zones := append([]string{entry.Name}, entry.ZoneNames...)
		for _, zone := range zones {
			key := strings.ToLower(zone)
			if previous, ok := zoneOwners[key]; ok && previous != name {
				ambiguousZones[key] = true
				delete(c.zoneRules, key)
			} else {
				zoneOwners[key] = name
			}
			if ambiguousZones[key] {
				continue
			}
			rules := c.zoneRules[key]
			if rules == nil {
				rules = make(map[uint32]instanceRule)
				c.zoneRules[key] = rules
			}
			for id, identity := range entry.HostileEntries {
				if _, exists := rules[id]; exists {
					continue
				}
				category := "trash"
				if identity.Boss {
					category = "boss"
				}
				rules[id] = instanceRule{category, affiliation(identity.Affiliation)}
			}
		}
	}
	return c
}
func (c *Collector) Consume(ctx context.Context, a consumers.Advancer) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		ms, err := a.Advance(ctx)
		for _, m := range ms {
			if e := c.Process(m); e != nil {
				return e
			}
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}
func bounds(first, last *time.Time, t time.Time) {
	if t.Before(*first) {
		*first = t
	}
	if t.After(*last) {
		*last = t
	}
}

const EvidenceStringLimit = 256

func bounded(s string) string {
	if len(s) <= EvidenceStringLimit {
		return s
	}
	s = s[:EvidenceStringLimit]
	for !utf8.ValidString(s) && len(s) > 0 {
		s = s[:len(s)-1]
	}
	return s
}

// EventCount counts Process calls carrying at least one audited GUID, once per
// message regardless of the number of GUIDs or roles. GUID-free messages do not count.
func (c *Collector) EventCount() int64 { return c.eventCount }
func (r *Record) evidence(e Evidence, t time.Time) {
	if len(e.Name) > EvidenceStringLimit || len(e.Role) > EvidenceStringLimit {
		r.EvidenceTruncations++
	}
	e.Name = bounded(e.Name)
	e.Role = bounded(e.Role)
	for i := range r.Evidence {
		v := &r.Evidence[i]
		same := v.RelatedGUID == nil && e.RelatedGUID == nil || v.RelatedGUID != nil && e.RelatedGUID != nil && *v.RelatedGUID == *e.RelatedGUID
		if same && v.Role == e.Role && v.SpellID == e.SpellID && v.Name == e.Name {
			v.Observations++
			bounds(&v.FirstSeen, &v.LastSeen, t)
			return
		}
	}
	if len(r.Evidence) >= EvidenceLimit {
		r.EvidenceOverflow++
		return
	}
	e.FirstSeen = t
	e.LastSeen = t
	e.Observations = 1
	r.Evidence = append(r.Evidence, e)
}
func (c *Collector) classify(id guid.GUID) (kind, category, aff, recognition string) {
	kind = "unknown"
	category = "unknown"
	aff = "unknown"
	recognition = "unknown"
	switch {
	case id.IsZero():
		kind = "sentinel"
		category = "sentinel"
		recognition = "guid"
	case id.IsPlayer():
		kind = "player"
		category = "player"
		recognition = "guid"
	case id.IsPet():
		kind = "pet"
		category = "pet"
		recognition = "guid"
	case id.IsVehicle():
		kind = "vehicle"
	case id.IsCreature():
		kind = "creature"
	case id.IsObject():
		kind = "object"
	}
	// Pet entry bits are random, not template IDs.
	if id.IsPet() || id.IsPlayer() || id.IsZero() {
		return
	}
	if _, ok := totems.IsTotem(id); ok {
		category = "totem"
		recognition = "global"
	}
	if critters.IsCritter(id) {
		category = "critter"
		recognition = "global"
	}
	if _, ok := warlockdemon.IsWarlockDemon(id); ok && id.IsCreature() {
		category = "demon"
		recognition = "global"
	}
	if _, ok := traps.IsTrap(id); ok {
		category = "trap"
		recognition = "global"
	}
	if id.IsCreature() || id.IsVehicle() {
		entry, _ := id.GetEntry()
		if rule, ok := c.zoneRules[c.zoneKey][entry]; ok {
			// Category and affiliation are orthogonal: hostile totems remain totems.
			if category == "unknown" {
				category = rule.Category
			}
			aff = rule.Affiliation
			recognition = "instance"
		}
	}
	return
}
func (c *Collector) observe(id guid.GUID, t time.Time, observedAffiliation string) *Record {
	k, cat, aff, rec := c.classify(id)
	classificationConflict := observedAffiliation != "" && observedAffiliation != "unknown" && aff != "unknown" && aff != observedAffiliation
	if observedAffiliation != "" && observedAffiliation != "unknown" {
		aff = observedAffiliation
	}
	r := c.records[id]
	if r == nil {
		entry, _ := id.GetEntry()
		r = &Record{GUID: id, Entry: entry, Kind: k, Category: cat, Affiliation: aff, Recognition: rec, Unknown: rec == "unknown", FirstSeen: t, LastSeen: t}
		c.records[id] = r
	}
	if classificationConflict {
		r.Conflict = true
	}
	if c.zoneNameTruncated {
		r.EvidenceTruncations++
	}
	r.Observations++
	bounds(&r.FirstSeen, &r.LastSeen, t)
	if r.Affiliation != "unknown" && aff != "unknown" && r.Affiliation != aff {
		r.Conflict = true
	}
	if r.Category != cat && r.Category != "unknown" && cat != "unknown" {
		r.Conflict = true
	}
	if aff != "unknown" {
		r.Affiliation = aff
	}
	if rec != "unknown" {
		r.Category = cat
		if aff != "unknown" {
			r.Affiliation = aff
		}
		r.Recognition = rec
		r.Unknown = false
	}
	for i := range r.Contexts {
		v := &r.Contexts[i]
		if v.Zone == c.zone.Name && v.MapID == c.zone.MapID && v.InstanceID == c.zone.InstanceID && v.Category == cat && v.Affiliation == aff && v.Recognition == rec {
			v.Observations++
			bounds(&v.FirstSeen, &v.LastSeen, t)
			return r
		}
	}
	r.Contexts = append(r.Contexts, Context{Zone: c.zone.Name, MapID: c.zone.MapID, InstanceID: c.zone.InstanceID, Category: cat, Affiliation: aff, Recognition: rec, FirstSeen: t, LastSeen: t, Observations: 1})
	return r
}

// Records returns a detached, GUID-sorted diagnostic view.
func (c *Collector) Records() []Record {
	out := make([]Record, 0, len(c.records))
	for _, r := range c.records {
		v := *r
		v.Contexts = append([]Context(nil), r.Contexts...)
		v.Evidence = append([]Evidence(nil), r.Evidence...)
		for i := range v.Evidence {
			if p := v.Evidence[i].RelatedGUID; p != nil {
				x := *p
				v.Evidence[i].RelatedGUID = &x
			}
		}
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].GUID < out[j].GUID })
	return out
}

func affiliation(a types.Affiliation) string {
	switch a {
	case types.AffiliationFriendly:
		return "friendly"
	case types.AffiliationHostile:
		return "hostile"
	case types.AffiliationNeutral:
		return "neutral"
	default:
		return "unknown"
	}
}
