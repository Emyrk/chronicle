package identitycatalog

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestEvidencePolicyKnownAndDiagnostic(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name     string
		id       guid.GUID
		conflict bool
		want     int
	}{{"known", 1, false, 1}, {"unknown", 0xF13000FFFF000001, false, EvidenceLimit}, {"zero", 0, false, EvidenceLimit}, {"conflict", 1, true, EvidenceLimit}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c := New(nil)
			if tc.conflict {
				require.NoError(t, c.Process(&messages.NewOwner{Target: tc.id, NewOwner: tc.id}))
				require.True(t, c.records[tc.id].Conflict)
			}
			start := time.Unix(100, 0).UTC()
			for i := 0; i < 100; i++ {
				require.NoError(t, c.Process(&messages.SpellGo{MessageBase: messages.Base(start.Add(time.Duration(i) * time.Second)), Caster: tc.id, SpellID: chrondbc.SpellID(i + 1)}))
			}
			r := c.records[tc.id]
			require.Len(t, r.Evidence, tc.want)
			if tc.want == 1 {
				require.Zero(t, r.EvidenceOverflow)
				require.Equal(t, "SpellGo.Caster", r.Evidence[0].Role)
				require.Equal(t, int64(100), r.Evidence[0].Observations)
				require.Equal(t, start, r.Evidence[0].FirstSeen)
				require.Equal(t, start.Add(99*time.Second), r.Evidence[0].LastSeen)
			} else {
				require.Positive(t, r.EvidenceOverflow)
				found := false
				for _, e := range r.Evidence {
					found = found || e.Role == "spell/SpellGo.Caster"
				}
				require.True(t, found)
			}
			graph := ownergraph.NewRegistry()
			require.NoError(t, RegisterGraphOwner(graph, nil))
			snapshot, err := graph.Capture(c)
			require.NoError(t, err)
			v, err := graph.Restore(snapshot)
			require.NoError(t, err)
			restored := v.(*Collector)
			require.Equal(t, c, restored)
			m := &messages.SpellGo{Caster: tc.id, SpellID: 999}
			require.NoError(t, c.Process(m))
			require.NoError(t, restored.Process(m))
			require.Equal(t, c, restored)
		})
	}
}

func TestEvidencePolicyZoneTransitions(t *testing.T) {
	t.Parallel()
	reg := registry.NewRegistry(nil, database.WoWFlavor{})
	reg.RegisterEntry(registry.Entry{Name: "Known", HostileEntries: map[uint32]instances.Identity{42: {Affiliation: types.AffiliationHostile}}})
	id := guid.GUID(0xF13000002A000001)
	for _, first := range []string{"Known", "Unknown"} {
		t.Run(first, func(t *testing.T) {
			t.Parallel()
			c := New(reg)
			cast := func(z string, spell chrondbc.SpellID) {
				require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: z}}))
				require.NoError(t, c.Process(&messages.SpellGo{Caster: id, SpellID: spell}))
			}
			cast(first, 1)
			initial := len(c.records[id].Evidence)
			if first == "Known" {
				require.Equal(t, 1, initial)
			} else {
				require.Equal(t, 2, initial)
			}
			second := "Known"
			if first == "Known" {
				second = "Unknown"
			}
			cast(second, 2)
			require.Greater(t, len(c.records[id].Evidence), initial)
			retained := len(c.records[id].Evidence)
			cast("Known", 3)
			require.Greater(t, len(c.records[id].Evidence), retained)
			require.True(t, c.records[id].diagnosticEvidence())
			require.Equal(t, "instance", c.records[id].Recognition)
			graph := ownergraph.NewRegistry()
			require.NoError(t, RegisterGraphOwner(graph, reg))
			snap, err := graph.Capture(c)
			require.NoError(t, err)
			v, err := graph.Restore(snap)
			require.NoError(t, err)
			restored := v.(*Collector)
			require.NoError(t, restored.Process(&messages.SpellGo{Caster: id, SpellID: 4}))
			require.Greater(t, len(restored.records[id].Evidence), len(c.records[id].Evidence))
		})
	}
}

func TestEvidencePolicySameMessageCycle(t *testing.T) {
	t.Parallel()
	c := New(nil)
	require.NoError(t, c.Process(&messages.NewOwner{Target: 1, NewOwner: 1}))
	r := c.records[1]
	require.True(t, r.Conflict)
	require.Len(t, r.Evidence, 3)
	require.Equal(t, "NewOwner.Target", r.Evidence[0].Role)
	require.Equal(t, "NewOwner.NewOwner", r.Evidence[1].Role)
	require.Equal(t, "owner/direct", r.Evidence[2].Role)
}

// Compare the same known GUID and 100 identical input casts under the previous
// uniform 64-entry policy and current policy. Only evidence retention differs.
func TestKnownEvidenceJSONReduction(t *testing.T) {
	t.Parallel()
	c := New(nil)
	start := time.Unix(100, 0).UTC()
	for i := 1; i <= 100; i++ {
		require.NoError(t, c.Process(&messages.SpellGo{MessageBase: messages.Base(start.Add(time.Duration(i) * time.Second)), Caster: 1, SpellID: chrondbc.SpellID(i)}))
	}
	current := c.Records()[0]
	previous := current
	previous.Evidence = nil
	previous.Conflict = true
	for i := 1; i <= 100; i++ {
		ts := start.Add(time.Duration(i) * time.Second)
		previous.evidence(Evidence{Role: "SpellGo.Caster"}, ts)
		previous.evidence(Evidence{Role: "spell/SpellGo.Caster", SpellID: int32(i)}, ts)
	}
	previous.Conflict = false
	before, err := json.Marshal(previous)
	require.NoError(t, err)
	after, err := json.Marshal(current)
	require.NoError(t, err)
	require.Len(t, previous.Evidence, 64)
	require.Len(t, current.Evidence, 1)
	require.Less(t, len(after), len(before))
	t.Logf("same 100-cast known record JSON: uniform64=%d bytes, known1=%d bytes (%.1f%% smaller)", len(before), len(after), 100*(1-float64(len(after))/float64(len(before))))
}

func TestEvidencePolicySameMessageAffiliationConflict(t *testing.T) {
	t.Parallel()
	reg := registry.NewRegistry(nil, database.WoWFlavor{})
	reg.RegisterEntry(registry.Entry{Name: "Known", HostileEntries: map[uint32]instances.Identity{42: {Affiliation: types.AffiliationHostile}}})
	c := New(reg)
	require.NoError(t, c.Process(&messages.Zone{Zone: zone.Zone{Name: "Known"}}))
	id := guid.GUID(0xF13000002A000001)
	require.NoError(t, c.Process(&messages.UnitClassificationEvent{Target: id, Affiliation: types.AffiliationFriendly, Spell: &chrondbc.Spell{ID: 123}}))
	r := c.records[id]
	require.True(t, r.Conflict)
	require.Equal(t, "instance", r.Recognition)
	require.Len(t, r.Evidence, 3)
	require.Equal(t, "spell/UnitClassificationEvent.Target", r.Evidence[2].Role)
}

func TestEvidencePolicyPreservesOlderKnownSnapshot(t *testing.T) {
	t.Parallel()
	c := New(nil)
	require.NoError(t, c.Process(&messages.SpellGo{Caster: 1, SpellID: 1}))
	r := c.records[1]
	// Model a valid pre-reduction snapshot containing several known summaries.
	r.Conflict = true
	r.evidence(Evidence{Role: "spell/SpellGo.Caster", SpellID: 1}, time.Time{})
	r.Conflict = false
	graph := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(graph, nil))
	snap, err := graph.Capture(c)
	require.NoError(t, err)
	v, err := graph.Restore(snap)
	require.NoError(t, err)
	restored := v.(*Collector)
	require.NoError(t, restored.Process(&messages.SpellGo{Caster: 1, SpellID: 1}))
	require.Len(t, restored.records[1].Evidence, 2)
	require.Equal(t, int64(2), restored.records[1].Evidence[1].Observations)
	require.NoError(t, restored.Process(&messages.SpellGo{Caster: 1, SpellID: 2}))
	require.Len(t, restored.records[1].Evidence, 2)
	require.Zero(t, restored.records[1].EvidenceOverflow)
}

func TestSuppressedKnownEvidenceDoesNotWarnTruncation(t *testing.T) {
	t.Parallel()
	c := New(nil)
	require.NoError(t, c.Process(&messages.Heal{Caster: 1, Target: 2, SpellName: strings.Repeat("x", EvidenceStringLimit+1)}))
	for _, r := range c.Records() {
		require.Len(t, r.Evidence, 1)
		require.Zero(t, r.EvidenceTruncations)
		require.Zero(t, r.EvidenceOverflow)
	}
	// Retained repeated summaries still count actual truncation.
	r := &Record{GUID: 1}
	e := Evidence{Role: "name", Name: strings.Repeat("x", EvidenceStringLimit+1)}
	r.evidence(e, time.Time{})
	r.evidence(e, time.Time{})
	require.Equal(t, int64(2), r.EvidenceTruncations)
	// Diagnostic candidates count truncation even when the diagnostic cap drops them.
	r = &Record{GUID: 0}
	for i := 0; i < EvidenceLimit; i++ {
		r.evidence(Evidence{Role: "spell", SpellID: int32(i + 1)}, time.Time{})
	}
	r.evidence(e, time.Time{})
	require.Equal(t, int64(1), r.EvidenceTruncations)
	require.Equal(t, int64(1), r.EvidenceOverflow)
}
