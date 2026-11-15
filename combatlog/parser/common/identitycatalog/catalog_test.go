package identitycatalog

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/playerposition"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestMetadataAndZero(t *testing.T) {
	t.Parallel()
	c := New(nil)
	one := guid.GUID(1)
	two := guid.GUID(2)
	three := guid.GUID(3)
	ms := []messages.Message{&messages.Versions{Player: &one}, &messages.PlayerPosition{PlayerPosition: playerposition.PlayerPosition{Guid: two.String()}}, &messages.Unit{Info: unitinfo.Info{Guid: three, Owner: &two}}, &messages.UnitTarget{Unit: one, Target: new(guid.GUID)}, &messages.RaidGroup{}}
	for _, m := range ms {
		require.NoError(t, c.Process(m))
	}
	rs := c.Records()
	require.Len(t, rs, 4)
	require.Equal(t, guid.GUID(0), rs[0].GUID)
	require.Equal(t, "sentinel", rs[0].Kind)
	empty := New(nil)
	require.NoError(t, empty.Process(&messages.RaidGroup{}))
	require.Empty(t, empty.Records())
}
func TestContextAndPetCollision(t *testing.T) {
	t.Parallel()
	reg := registry.NewRegistry(nil, database.WoWFlavor{})
	reg.RegisterEntry(registry.Entry{Name: "Test", ZoneNames: []string{"test"}, HostileEntries: map[uint32]instances.Identity{42: {Name: "Boss", Boss: true, Affiliation: types.AffiliationHostile}}})
	c := New(reg)
	id := guid.GUID(0xF13000002A000001)
	pet := guid.GUID(0xF14000002A000001)
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: id}))
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: "Test", InstanceID: 12}}))
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: id}))
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: pet}))
	r := c.records[id]
	require.Len(t, r.Contexts, 2)
	require.Equal(t, "unknown", r.Contexts[0].Recognition)
	require.Equal(t, "instance", r.Contexts[1].Recognition)
	require.Equal(t, "boss", r.Contexts[1].Category)
	require.Equal(t, "pet", c.records[pet].Category)
}
func TestEvidenceOverflowDoesNotCapGUIDs(t *testing.T) {
	t.Parallel()
	c := New(nil)
	for i := 1; i <= EvidenceLimit*3; i++ {
		require.NoError(t, c.Process(&messages.SpellGo{Caster: 1, SpellID: chrondbc.SpellID(i)}))
		require.NoError(t, c.Process(&messages.UnitTarget{Unit: guid.GUID(i)}))
	}
	require.Len(t, c.Records(), EvidenceLimit*3)
	r := c.records[1]
	require.Len(t, r.Evidence, EvidenceLimit)
	require.Positive(t, r.EvidenceOverflow)
	detached := c.Records()
	detached[0].Evidence[0].Role = "changed"
	require.NotEqual(t, "changed", c.records[1].Evidence[0].Role)
}
func TestGraphContinuation(t *testing.T) {
	t.Parallel()
	c := New(nil)
	ts := time.Unix(100, 0).UTC()
	root := guid.GUID(1)
	pet := guid.GUID(2)
	child := guid.GUID(3)
	for _, m := range []messages.Message{&messages.Zone{Zone: zone.Zone{Name: "Somewhere", InstanceID: 1}}, &messages.NewOwner{MessageBase: messages.Base(ts), Target: pet, NewOwner: root}, &messages.NewOwner{MessageBase: messages.Base(ts), Target: child, NewOwner: pet}} {
		require.NoError(t, c.Process(m))
	}
	reg := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(reg, nil))
	snap, err := reg.Capture(c)
	require.NoError(t, err)
	v, err := reg.Restore(snap)
	require.NoError(t, err)
	restored := v.(*Collector)
	require.Equal(t, c, restored)
	next := &messages.NewOwner{MessageBase: messages.Base(ts.Add(time.Second)), Target: pet, NewOwner: 4}
	require.NoError(t, c.Process(next))
	require.NoError(t, restored.Process(next))
	next2 := &messages.UnitTarget{MessageBase: messages.Base(ts.Add(2 * time.Second)), Unit: child}
	require.NoError(t, c.Process(next2))
	require.NoError(t, restored.Process(next2))
	require.Equal(t, c, restored)
	var roots []guid.GUID
	for _, e := range c.records[child].Evidence {
		if e.Role == "owner/root" {
			roots = append(roots, *e.RelatedGUID)
		}
	}
	require.Equal(t, []guid.GUID{1, 4}, roots)
	require.Equal(t, "unknown", c.records[child].Affiliation)
}

type terminalAdvancer struct{ m messages.Message }

func (a terminalAdvancer) Advance(context.Context) ([]messages.Message, error) {
	return []messages.Message{a.m}, io.EOF
}
func TestConsumeTerminalBatch(t *testing.T) {
	t.Parallel()
	c := New(nil)
	require.NoError(t, c.Consume(context.Background(), terminalAdvancer{&messages.UnitTarget{Unit: 123}}))
	require.Len(t, c.Records(), 1)
}

// BenchmarkCollectorSynthetic measures only typed message ingestion, not parsing,
// database work, or end-to-end fixture throughput. GUID cardinality is 10,000.
func BenchmarkCollectorSynthetic(b *testing.B) {
	c := New(nil)
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_ = c.Process(&messages.UnitTarget{Unit: guid.GUID(i%10000 + 1)})
	}
}

func TestThreatRoles(t *testing.T) {
	t.Parallel()
	c := New(nil)
	mob := guid.GUID(4)
	require.NoError(t, c.Process(&messages.Threat{Mob: &mob, Source: guid.GUID(1).String(), Entries: []messages.ThreatEntry{{Player: guid.GUID(2).String()}, {Player: "NotAGUID"}}}))
	require.NoError(t, c.Process(&messages.ThreatTank{Source: guid.GUID(3).String(), Entries: []messages.ThreatTankEntry{{ServerGUID: guid.GUID(5).String(), NextPlayer: guid.GUID(6).String()}}}))
	require.Len(t, c.Records(), 6)
}
func TestRawAndResolvedSpellEvidence(t *testing.T) {
	t.Parallel()
	c := New(nil)
	require.NoError(t, c.Process(&messages.Damage{Target: 1, SpellID: 12, SpellData: &chrondbc.Spell{ID: 13}}))
	var ids []int32
	for _, e := range c.records[1].Evidence {
		if strings.HasPrefix(e.Role, "spell/") {
			ids = append(ids, e.SpellID)
		}
	}
	require.Equal(t, []int32{12, 13}, ids)
}

func TestGraphRejectsInvalidState(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"unknown_field", func(v map[string]any) { v["surprise"] = true }},
		{"configuration", func(v map[string]any) { v["configuration"] = "other" }},
		{"duplicate_guid", func(v map[string]any) { r := v["records"].([]any); v["records"] = append(r, r[0]) }},
		{"negative_count", func(v map[string]any) { v["records"].([]any)[0].(map[string]any)["observations"] = -1 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			c := New(nil)
			require.NoError(t, c.Process(&messages.UnitTarget{Unit: 1}))
			r := ownergraph.NewRegistry()
			require.NoError(t, RegisterGraphOwner(r, nil))
			s, err := r.Capture(c)
			require.NoError(t, err)
			changed := false
			for i, n := range s.Graph.Nodes {
				if n.Type != "identitycatalog.Collector" {
					continue
				}
				var envelope map[string]any
				require.NoError(t, json.Unmarshal(n.Metadata, &envelope))
				data := envelope["data"].(map[string]any)
				test.mutate(data)
				s.Graph.Nodes[i].Metadata, err = json.Marshal(envelope)
				require.NoError(t, err)
				changed = true
			}
			require.True(t, changed)
			_, err = r.Restore(s)
			require.Error(t, err)
		})
	}
}

func TestGlobalCategories(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		entry uint32
		high  uint64
		want  string
	}{{5925, 0xF130, "totem"}, {4075, 0xF130, "critter"}, {89, 0xF130, "demon"}, {2561, 0xF110, "trap"}, {89, 0xF110, "unknown"}} {
		c := New(nil)
		id := guid.GUID(test.high<<48 | uint64(test.entry)<<24 | 1)
		require.NoError(t, c.Process(&messages.UnitTarget{Unit: id}))
		require.Equal(t, test.want, c.records[id].Category)
	}
}

func TestEventCountAndBoundedEvidence(t *testing.T) {
	t.Parallel()
	c := New(nil)
	zero := guid.GUID(0)
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: strings.Repeat("界", 100)}}))
	require.NoError(t, c.Process(&messages.Heal{Caster: 1, Target: 2, SpellName: strings.Repeat("界", 100)}))
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: 1, Target: &zero}))
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: 0}))
	require.Equal(t, int64(3), c.EventCount())
	require.Equal(t, int64(2), c.records[0].Observations)
	require.Positive(t, c.records[1].EvidenceTruncations)
	for _, r := range c.Records() {
		for _, e := range r.Evidence {
			require.LessOrEqual(t, len(e.Name), EvidenceStringLimit)
		}
		for _, ctx := range r.Contexts {
			require.LessOrEqual(t, len(ctx.Zone), EvidenceStringLimit)
		}
	}
	reg := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(reg, nil))
	snap, err := reg.Capture(c)
	require.NoError(t, err)
	v, err := reg.Restore(snap)
	require.NoError(t, err)
	restored := v.(*Collector)
	require.Equal(t, c, restored)
	require.NoError(t, restored.Process(&messages.UnitTarget{Unit: 1}))
	require.Equal(t, int64(4), restored.EventCount())
}

func TestObservedAffiliationContextsAndOwnerRetention(t *testing.T) {
	t.Parallel()
	c := New(nil)
	owner := guid.GUID(2)
	id := guid.GUID(0xF13000002A000001)
	require.NoError(t, c.Process(&messages.Unit{Info: unitinfo.Info{Guid: id, Owner: &owner, Affiliation: types.AffiliationFriendly}}))
	require.NoError(t, c.Process(&messages.Unit{Info: unitinfo.Info{Guid: id, Affiliation: types.AffiliationHostile}}))
	r := c.records[id]
	require.Len(t, r.Contexts, 2)
	require.Equal(t, "friendly", r.Contexts[0].Affiliation)
	require.Equal(t, "hostile", r.Contexts[1].Affiliation)
	require.True(t, r.Conflict)
	require.Equal(t, "unknown", r.Category)
	require.Equal(t, owner, c.owners[id])
	require.Equal(t, int64(1), r.Contexts[0].Observations)
	require.Equal(t, int64(1), r.Contexts[1].Observations)
	require.NoError(t, c.Process(&messages.NewOwner{Target: owner, NewOwner: id}))
	require.True(t, c.records[owner].Conflict)
	require.NotEmpty(t, c.records[owner].Evidence)
}

func TestRegisteredTotemKeepsCategory(t *testing.T) {
	t.Parallel()
	reg := registry.NewRegistry(nil, database.WoWFlavor{})
	reg.RegisterEntry(registry.Entry{Name: "Test", ZoneNames: []string{"test"}, HostileEntries: map[uint32]instances.Identity{5925: {Affiliation: types.AffiliationHostile}}})
	c := New(reg)
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: "TEST"}}))
	id := guid.GUID(uint64(0xF130)<<48 | uint64(5925)<<24 | 1)
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: id}))
	r := c.records[id]
	require.Equal(t, "totem", r.Category)
	require.Equal(t, "hostile", r.Affiliation)
	require.Equal(t, "instance", r.Recognition)
	graph := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(graph, reg))
	snap, err := graph.Capture(c)
	require.NoError(t, err)
	v, err := graph.Restore(snap)
	require.NoError(t, err)
	restored := v.(*Collector)
	require.Equal(t, c, restored)
	require.NoError(t, restored.Process(&messages.UnitTarget{Unit: id}))
	require.Equal(t, "totem", restored.records[id].Category)
}

// BenchmarkCollectorPopulatedRegistry exercises the real classic registry and
// recognized creature hot path, excluding parser/fixture decoding and construction.
func BenchmarkCollectorPopulatedRegistry(b *testing.B) {
	reg := registry.RegistryForFlavor(slog.New(slog.NewTextHandler(io.Discard, nil)), database.WoWFlavor{})
	var zoneName string
	var entry uint32
	names := make([]string, 0, len(reg.Entries()))
	for name := range reg.Entries() {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		r := reg.Entries()[name]
		ids := make([]uint32, 0, len(r.HostileEntries))
		for id := range r.HostileEntries {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		if len(ids) > 0 {
			zoneName = r.Name
			entry = ids[0]
			break
		}
	}

	if zoneName == "" {
		b.Fatal("real registry contains no hostile entries")
	}
	c := New(reg)
	_ = c.Process(&messages.Zone{Zone: zone.Zone{Name: zoneName}})
	id := guid.GUID(uint64(0xF130)<<48 | uint64(entry)<<24 | 1)
	m := &messages.UnitTarget{Unit: id}
	_ = c.Process(m)
	if c.records[id].Recognition != "instance" {
		b.Fatal("benchmark did not exercise registry recognition")
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = c.Process(m)
	}
}

func TestSpellRoleAttribution(t *testing.T) {
	t.Parallel()
	caster, target, shield := guid.GUID(1), guid.GUID(2), guid.GUID(3)
	cases := []struct {
		name string
		msg  messages.Message
		want map[guid.GUID]map[string][]int32
	}{
		{"damage", &messages.Damage{Caster: &caster, Target: target, SpellID: 10}, map[guid.GUID]map[string][]int32{caster: {"spell/Damage.Caster": {10}}, target: {"spell/Damage.Target": {10}}}},
		{"self_damage", &messages.Damage{Caster: &caster, Target: caster, SpellID: 10}, map[guid.GUID]map[string][]int32{caster: {"spell/Damage.Caster": {10}, "spell/Damage.Target": {10}}}},
		{"interrupt", &messages.Interrupt{Caster: caster, Target: target, ExtraSpellID: 21, InterruptSpell: &chrondbc.Spell{ID: 20}, InterruptedSpell: &chrondbc.Spell{ID: 22}}, map[guid.GUID]map[string][]int32{caster: {"spell/Interrupt.Caster": {20}}, target: {"spell/Interrupt.Target": {21, 22}}}},
		{"absorb", &messages.Absorbed{Attacker: caster, Target: target, Caster: shield, DamageSpell: &chrondbc.Spell{ID: 30}, AbsorbSpell: &chrondbc.Spell{ID: 31}}, map[guid.GUID]map[string][]int32{caster: {"spell/Absorbed.Attacker/damage": {30}}, target: {"spell/Absorbed.Target/damage": {30}, "spell/Absorbed.Target/absorb": {31}}, shield: {"spell/Absorbed.Caster/absorb": {31}}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c := New(nil)
			require.NoError(t, c.Process(tc.msg))
			got := map[guid.GUID]map[string][]int32{}
			for _, r := range c.Records() {
				for _, e := range r.Evidence {
					require.NotEqual(t, "spell", e.Role)
					if strings.HasPrefix(e.Role, "spell/") {
						if got[r.GUID] == nil {
							got[r.GUID] = map[string][]int32{}
						}
						got[r.GUID][e.Role] = append(got[r.GUID][e.Role], e.SpellID)
					}
				}
			}
			require.Equal(t, tc.want, got)
		})
	}
}

func TestAmbiguousZoneFailsClosed(t *testing.T) {
	t.Parallel()
	reg := registry.NewRegistry(nil, database.WoWFlavor{})
	reg.RegisterEntry(registry.Entry{Name: "Alpha", ZoneNames: []string{"shared"}, HostileEntries: map[uint32]instances.Identity{42: {Affiliation: types.AffiliationHostile}}})
	reg.RegisterEntry(registry.Entry{Name: "Beta", ZoneNames: []string{"SHARED"}, HostileEntries: map[uint32]instances.Identity{43: {Affiliation: types.AffiliationHostile}}})
	c := New(reg)
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: "Shared", InstanceID: 1}}))
	ids := []guid.GUID{guid.GUID(uint64(0xF130)<<48 | uint64(42)<<24 | 1), guid.GUID(uint64(0xF130)<<48 | uint64(43)<<24 | 1)}
	for _, id := range ids {
		require.NoError(t, c.Process(&messages.UnitTarget{Unit: id}))
		require.Equal(t, "unknown", c.records[id].Recognition)
		require.True(t, c.records[id].Unknown)
	}
	// A genuinely distinct current zone name can select one registration; the
	// creature's entry alone must never select an instance under a shared name.
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: "Alpha", InstanceID: 2}}))
	require.NoError(t, c.Process(&messages.UnitTarget{Unit: ids[0]}))
	require.Equal(t, "instance", c.records[ids[0]].Recognition)
	require.Len(t, c.records[ids[0]].Contexts, 2)
	require.Equal(t, uint32(1), c.records[ids[0]].Contexts[0].InstanceID)
	require.Equal(t, "unknown", c.records[ids[0]].Contexts[0].Recognition)
	require.Equal(t, uint32(2), c.records[ids[0]].Contexts[1].InstanceID)
	graph := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(graph, reg))
	snap, err := graph.Capture(c)
	require.NoError(t, err)
	v, err := graph.Restore(snap)
	require.NoError(t, err)
	restored := v.(*Collector)
	require.Equal(t, c, restored)
	require.NoError(t, restored.Process(&messages.Zone{Zone: zone.Zone{Name: "shared", InstanceID: 3}}))
	require.NoError(t, restored.Process(&messages.UnitTarget{Unit: ids[1]}))
	require.Equal(t, "unknown", restored.records[ids[1]].Recognition)
}
