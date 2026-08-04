package resynccandidate_test

import (
	"testing"

	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynccandidate"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func makeRow(id uuid.UUID, parserVersion, instanceName string) database.ResyncCandidateLogGroupsRow {
	return database.ResyncCandidateLogGroupsRow{
		ID:            id,
		ParserVersion: parserVersion,
		InstanceName:  instanceName,
	}
}

func TestFilterAndGroup_PatchComparison(t *testing.T) {
	t.Parallel()

	id1 := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("00000000-0000-0000-0000-000000000002")

	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id1, "v0.0.100", "Molten Core"),
		makeRow(id2, "v0.0.425", "Onyxia"),
	}

	// Target v0.0.425 — only id1 (v0.0.100) should be a candidate.
	groups := resynccandidate.FilterAndGroup(rows, "v0.0.425", 100)
	require.Len(t, groups, 1)
	require.Equal(t, id1, groups[0].ID)
}

func TestFilterAndGroup_MajorMinorComparison(t *testing.T) {
	t.Parallel()

	id1 := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	id3 := uuid.MustParse("00000000-0000-0000-0000-000000000003")

	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id1, "v0.0.999", "BWL"), // patch 999, but minor 0
		makeRow(id2, "v0.1.0", "MC"),    // minor 1
		makeRow(id3, "v1.0.0", "Naxx"),  // major 1
	}

	// Target v1.0.1 — all three should be candidates because their
	// encoded values are less than v1.0.1's encoded value.
	groups := resynccandidate.FilterAndGroup(rows, "v1.0.1", 100)
	require.Len(t, groups, 3)
}

func TestFilterAndGroup_IncludesAllInstancesAndRealmsForSelectedGroup(t *testing.T) {
	t.Parallel()

	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	realm1 := uuid.MustParse("10000000-0000-0000-0000-000000000001")
	realm2 := uuid.MustParse("10000000-0000-0000-0000-000000000002")
	rows := []database.ResyncCandidateLogGroupsRow{
		{ID: id, ParserVersion: "v0.0.100", InstanceName: "MC", RealmID: realm1},
		{ID: id, ParserVersion: "v0.0.425", InstanceName: "Onyxia", RealmID: realm2},
	}

	groups := resynccandidate.FilterAndGroup(rows, "v0.0.425", 100)
	require.Len(t, groups, 1)
	require.Equal(t, []string{"MC", "Onyxia"}, groups[0].Instances)
	require.Equal(t, []uuid.UUID{realm1, realm2}, groups[0].RealmIDs)
}

func TestFilterAndGroup_Dedup(t *testing.T) {
	t.Parallel()

	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id, "v0.0.100", "MC"),
		makeRow(id, "v0.0.100", "Onyxia"),
		makeRow(id, "v0.0.100", "BWL"),
	}

	groups := resynccandidate.FilterAndGroup(rows, "v0.0.200", 100)
	require.Len(t, groups, 1)
	require.Equal(t, id, groups[0].ID)
	require.Len(t, groups[0].Instances, 3)
	require.Equal(t, []string{"MC", "Onyxia", "BWL"}, groups[0].Instances)
}

func TestFilterAndGroup_LimitDistinctGroups(t *testing.T) {
	t.Parallel()

	id1 := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	id2 := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	id3 := uuid.MustParse("00000000-0000-0000-0000-000000000003")

	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id1, "v0.0.1", "MC"),
		makeRow(id1, "v0.0.1", "Onyxia"),
		makeRow(id2, "v0.0.1", "BWL"),
		makeRow(id3, "v0.0.1", "Naxx"),
	}

	// Limit 2 distinct groups. id1 has 2 instances, but it's one group.
	groups := resynccandidate.FilterAndGroup(rows, "v0.0.100", 2)
	require.Len(t, groups, 2)
	require.Equal(t, id1, groups[0].ID)
	require.Len(t, groups[0].Instances, 2) // Both instances kept.
	require.Equal(t, id2, groups[1].ID)
}

func TestFilterAndGroup_ZeroLimit(t *testing.T) {
	t.Parallel()

	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id, "v0.0.1", "MC"),
	}

	// limit=0 means unlimited.
	groups := resynccandidate.FilterAndGroup(rows, "v0.0.100", 0)
	require.Len(t, groups, 1)
}

func TestFilterAndGroup_InvalidTarget(t *testing.T) {
	t.Parallel()

	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(uuid.New(), "v0.0.1", "MC"),
	}

	groups := resynccandidate.FilterAndGroup(rows, "not-a-version", 100)
	require.Nil(t, groups)
}

func TestFilterAndGroup_EqualVersionExcluded(t *testing.T) {
	t.Parallel()

	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id, "v0.0.425", "MC"),
	}

	// Same version should NOT be a candidate.
	groups := resynccandidate.FilterAndGroup(rows, "v0.0.425", 100)
	require.Len(t, groups, 0)
}

func TestFilterAndGroup_BuildMetadataStripped(t *testing.T) {
	t.Parallel()

	id := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	rows := []database.ResyncCandidateLogGroupsRow{
		makeRow(id, "v0.0.424+abc123", "MC"),
	}

	// Build metadata ("+abc123") is stripped, leaving v0.0.424 < v0.0.425.
	groups := resynccandidate.FilterAndGroup(rows, "v0.0.425+def456", 100)
	require.Len(t, groups, 1)
	require.Equal(t, id, groups[0].ID)
}

func TestFilterAndGroup_EmptyInput(t *testing.T) {
	t.Parallel()

	groups := resynccandidate.FilterAndGroup(nil, "v0.0.100", 50)
	require.Len(t, groups, 0)
}

func TestDefaultTargetVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		tag      string
		commit   string
		expected string
	}{
		{"tag+commit", "v0.0.425", "abc123", "v0.0.425+abc123"},
		{"tag only, unknown commit", "v0.0.425", "unknown", "v0.0.425"},
		{"tag only, empty commit", "v0.0.425", "", "v0.0.425"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := resynccandidate.DefaultTargetVersion(tc.tag, tc.commit)
			require.Equal(t, tc.expected, got)
		})
	}
}
