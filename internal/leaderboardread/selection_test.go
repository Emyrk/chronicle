package leaderboardread

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSelectionAndCursor(t *testing.T) {
	t.Parallel()
	rows := []database.ResolveLeaderboardConfigurationRow{
		{Kind: "instance", InstanceName: "Raid"}, {Kind: "boss", InstanceName: "Raid", EncounterName: "A", HasPoints: true, Points: 10}, {Kind: "boss", InstanceName: "Raid", EncounterName: "B", HasPoints: true, Points: 20},
		{Kind: "set", InstanceName: "Raid", SetKey: "default"}, {Kind: "member", InstanceName: "Raid", SetKey: "default", EncounterName: "A"}, {Kind: "set", InstanceName: "Raid", SetKey: "empty"},
	}
	r := Request{Instance: "Raid", Subject: "player", Kind: "boss", Score: "peak", Class: "MAGE", Spec: "Frost", Metric: "dps", Set: "default"}
	s, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"A"}, s.Bosses)
	r.Set = "empty"
	s, err = Select(rows, r)
	require.NoError(t, err)
	require.Zero(t, s.Denominator)
	r.Kind = "renown"
	r.Score = "renown"
	r.Set = ""
	r.Class = ""
	r.Spec = ""
	r.Metric = ""
	s, err = Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"A"}, s.Bosses)
	r.MaxPlayers = 25
	_, err = Select(rows, r)
	require.Error(t, err)
	rows = append(rows, database.ResolveLeaderboardConfigurationRow{Kind: "variant", InstanceName: "Raid", DifficultyName: "Heroic", MaxPlayers: 25}, database.ResolveLeaderboardConfigurationRow{Kind: "boss_variant", InstanceName: "Raid", EncounterName: "A", DifficultyName: "Heroic", MaxPlayers: 25, HasPoints: true, Points: 0})
	r.Difficulty = "Heroic"
	s, err = Select(rows, r)
	require.NoError(t, err)
	require.Zero(t, s.Awards[0])
	r.Set = "default"
	_, err = Select(rows, r)
	require.NoError(t, err)
	r.Set = ""
	tenant := uuid.New()
	fp := Fingerprint(tenant, r, s)
	encoded := EncodeCursor(Cursor{Fingerprint: fp, Score: 12.123456, Realm: uuid.New(), Subject: "A"})
	c, err := DecodeCursor(encoded, fp)
	require.NoError(t, err)
	require.Equal(t, 12.123456, c.Score)
	_, err = DecodeCursor(encoded, Fingerprint(uuid.New(), r, s))
	require.Error(t, err)
	r.Search = "changed"
	_, err = DecodeCursor(encoded, Fingerprint(tenant, r, s))
	require.Error(t, err)
	rows = append(rows, database.ResolveLeaderboardConfigurationRow{Kind: "conflict"})
	_, err = Select(rows, r)
	require.Error(t, err)
}

func TestArbitraryBossGroups(t *testing.T) {
	t.Parallel()
	rows := []database.ResolveLeaderboardConfigurationRow{{Kind: "instance", InstanceName: "Raid"}, {Kind: "boss", InstanceName: "Raid", EncounterName: "A", HasPoints: true, Points: 10}, {Kind: "boss", InstanceName: "Raid", EncounterName: "B", HasPoints: true, Points: 20}, {Kind: "boss", InstanceName: "Other", EncounterName: "C"}}
	r := Request{Instance: "Raid", Subject: "player", Kind: "boss", Score: "mastery", Class: "MAGE", Spec: "Frost", Metric: "dps", Bosses: []string{"B", "A", "A"}}
	s, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"A", "B"}, s.Bosses)
	require.EqualValues(t, 2, s.Denominator)
	tenant := uuid.New()
	fp := Fingerprint(tenant, r, s)
	r.Bosses = []string{"A", "B"}
	same, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, fp, Fingerprint(tenant, r, same))
	r.Bosses = []string{"A"}
	one, err := Select(rows, r)
	require.NoError(t, err)
	require.NotEqual(t, fp, Fingerprint(tenant, r, one))
	r.Bosses = []string{"A", "C"}
	_, err = Select(rows, r)
	require.Error(t, err)
	r.Bosses = []string{""}
	_, err = Select(rows, r)
	require.Error(t, err)
	r.Bosses = []string{"A"}
	r.Set = "default"
	_, err = Select(rows, r)
	require.Error(t, err)
	r = Request{Instance: "Raid", Subject: "guild", Kind: "renown", Score: "renown", Boss: "B"}
	bossRenown, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"B"}, bossRenown.Bosses)
	require.Equal(t, []float64{20}, bossRenown.Awards)
	r.Boss = ""
	r.Bosses = []string{"A", "B"}
	allRenown, err := Select(rows, r)
	require.NoError(t, err)
	require.Len(t, allRenown.Bosses, 2)
}

func TestRenownOptionalBossWithEmptyDefault(t *testing.T) {
	t.Parallel()
	rows := []database.ResolveLeaderboardConfigurationRow{{Kind: "instance", InstanceName: "Vault"}, {Kind: "set", InstanceName: "Vault", SetKey: "default"}, {Kind: "boss", InstanceName: "Vault", EncounterName: "Optional", HasPoints: true, Points: 5}}
	r := Request{Instance: "Vault", Subject: "player", Kind: "renown", Score: "renown"}
	empty, err := Select(rows, r)
	require.NoError(t, err)
	require.Empty(t, empty.Bosses)
	tenant := uuid.New()
	before := Fingerprint(tenant, r, empty)
	r.Boss = "Optional"
	selected, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"Optional"}, selected.Bosses)
	require.Equal(t, []float64{5}, selected.Awards)
	require.NotEqual(t, before, Fingerprint(tenant, r, selected))
	r.Set = "default"
	_, err = Select(rows, r)
	require.Error(t, err)
}

func TestEncounterVariantSelectionAndCursor(t *testing.T) {
	t.Parallel()
	rows := []database.ResolveLeaderboardConfigurationRow{{Kind: "instance", InstanceName: "Ulduar"}, {Kind: "boss", InstanceName: "Ulduar", EncounterName: "Hodir"}, {Kind: "boss", InstanceName: "Ulduar", EncounterName: "Other"}}
	r := Request{Instance: "Ulduar", Subject: "player", Kind: "boss", Score: "peak", Metric: "dps", Boss: "Hodir"}
	selection, err := Select(rows, r)
	require.NoError(t, err)
	tenant := uuid.New()
	combined := Fingerprint(tenant, r, selection)
	r.EncounterVariant = "normal"
	exact, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, selection, exact)
	normal := Fingerprint(tenant, r, exact)
	require.NotEqual(t, combined, normal)
	r.EncounterVariant = "hard"
	require.NotEqual(t, normal, Fingerprint(tenant, r, exact))
	_, err = DecodeCursor(EncodeCursor(Cursor{Fingerprint: normal}), Fingerprint(tenant, r, exact))
	require.Error(t, err)
	r.EncounterVariant = "heroic"
	_, err = Select(rows, r)
	require.ErrorContains(t, err, "encounter_variant")
	r.EncounterVariant = "hard"
	r.Boss = ""
	r.Bosses = []string{"Hodir", "Other"}
	_, err = Select(rows, r)
	require.ErrorContains(t, err, "single boss")
	r.EncounterVariant = ""
	r.EncounterVariants = map[string]string{"Hodir": "hard"}
	mixed, err := Select(rows, r)
	require.NoError(t, err)
	require.Equal(t, []string{"Hodir", "Other"}, mixed.Bosses)
	require.EqualValues(t, 2, mixed.Denominator)
	hard := Fingerprint(tenant, r, mixed)
	r.EncounterVariants = map[string]string{"Hodir": "normal"}
	require.NotEqual(t, hard, Fingerprint(tenant, r, mixed))
	r.Kind, r.Score, r.Metric = "renown", "renown", ""
	renown, err := Select(rows, r)
	require.NoError(t, err)
	require.EqualValues(t, 1, renown.Denominator)
	require.Equal(t, mixed.Awards, renown.Awards, "variant selection does not create a Renown award scale")
	r.EncounterVariants = map[string]string{"Other": "hard"}
	_, err = Select(rows, r)
	require.ErrorContains(t, err, "not supported")
	r.EncounterVariants = map[string]string{"Unselected": "hard"}
	_, err = Select(rows, r)
	require.ErrorContains(t, err, "unselected")
	r.EncounterVariants = map[string]string{"Hodir": "combined"}
	_, err = Select(rows, r)
	require.ErrorContains(t, err, "not supported")
	r.EncounterVariants = map[string]string{"Hodir": "hard"}
	r.Kind, r.Score, r.Subject = "clear", "peak", "guild"
	_, err = Select(rows, r)
	require.ErrorContains(t, err, "boss or Renown")
}
