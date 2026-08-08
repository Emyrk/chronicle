package cli

import (
	"bufio"
	"bytes"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynccandidate"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestPromptApproval(t *testing.T) {
	t.Parallel()

	group := resynccandidate.Group{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Owner:         uuid.MustParse("10000000-0000-0000-0000-000000000001"),
		ParserVersion: "v0.0.700+old",
		Instances:     []string{"Molten Core", "Onyxia"},
		TenantName:    "Turtle WoW",
		TenantSlug:    "turtle",
		LogURL:        "https://turtle.chronicleclassic.com/logs/00000000-0000-0000-0000-000000000001",
		RawFileCount:  1,
		ExpectedFiles: 1,
		StorageValid:  true,
	}

	for _, tt := range []struct {
		name   string
		input  string
		want   approvalAction
		output string
	}{
		{name: "approve", input: "yes\n", want: approvalRun, output: "Molten Core"},
		{name: "skip", input: "n\n", want: approvalSkip, output: "Onyxia"},
		{name: "empty skips", input: "\n", want: approvalSkip, output: "[y]es"},
		{name: "quit", input: "q\n", want: approvalQuit, output: group.ID.String()},
		{name: "EOF quits", input: "", want: approvalQuit, output: "Candidate 1/2"},
		{name: "invalid retries", input: "maybe\ny\n", want: approvalRun, output: "Please enter y, n, or q."},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var out bytes.Buffer
			got, err := promptApproval(bufio.NewScanner(strings.NewReader(tt.input)), &out, group, 1, 2)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
			require.Contains(t, out.String(), tt.output)
		})
	}
}

func TestParseExcludedDatasetIDs(t *testing.T) {
	t.Parallel()

	first := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	second := uuid.MustParse("00000000-0000-0000-0000-000000000002")

	got, err := parseExcludedDatasetIDs([]string{first.String(), " " + second.String() + " ", first.String()})
	require.NoError(t, err)
	require.Equal(t, map[uuid.UUID]struct{}{first: {}, second: {}}, got)

	_, err = parseExcludedDatasetIDs([]string{"not-a-uuid"})
	require.ErrorContains(t, err, "invalid --exclude-dataset")
}

func TestGroupUsesExcludedDataset(t *testing.T) {
	t.Parallel()

	excludedDataset := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	includedDataset := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	excluded := map[uuid.UUID]struct{}{excludedDataset: {}}
	firstRealm := uuid.MustParse("10000000-0000-0000-0000-000000000001")
	secondRealm := uuid.MustParse("10000000-0000-0000-0000-000000000002")

	resolve := func(realmID uuid.UUID) uuid.UUID {
		if realmID == secondRealm {
			return excludedDataset
		}
		return includedDataset
	}

	require.False(t, groupUsesExcludedDataset(resynccandidate.Group{RealmIDs: []uuid.UUID{firstRealm}}, excluded, resolve))
	require.True(t, groupUsesExcludedDataset(resynccandidate.Group{RealmIDs: []uuid.UUID{firstRealm, secondRealm}}, excluded, resolve))
	require.False(t, groupUsesExcludedDataset(resynccandidate.Group{RealmIDs: []uuid.UUID{secondRealm}}, nil, resolve))
}

func TestGroupUsesExcludedDataset_NoRealmsUsesDefaultDataset(t *testing.T) {
	t.Parallel()

	excluded := map[uuid.UUID]struct{}{servicedataset.DefaultDatasetID: {}}
	require.True(t, groupUsesExcludedDataset(resynccandidate.Group{}, excluded, func(uuid.UUID) uuid.UUID {
		t.Fatal("resolver should not be called for a group without realms")
		return uuid.Nil
	}))
}

func TestFilterGroupsByExcludedDataset_CachesRealmsAndStopsAtLimit(t *testing.T) {
	t.Parallel()

	excludedDataset := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	includedDataset := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	excludedRealm := uuid.MustParse("10000000-0000-0000-0000-000000000001")
	includedRealm := uuid.MustParse("10000000-0000-0000-0000-000000000002")
	unvisitedRealm := uuid.MustParse("10000000-0000-0000-0000-000000000003")
	groups := []resynccandidate.Group{
		{ID: uuid.New(), RealmIDs: []uuid.UUID{excludedRealm}},
		{ID: uuid.New(), RealmIDs: []uuid.UUID{excludedRealm}},
		{ID: uuid.New(), RealmIDs: []uuid.UUID{includedRealm}},
		{ID: uuid.New(), RealmIDs: []uuid.UUID{unvisitedRealm}},
	}

	calls := make(map[uuid.UUID]int)
	got, excludedCount := filterGroupsByExcludedDataset(
		groups,
		map[uuid.UUID]struct{}{excludedDataset: {}},
		1,
		func(realmID uuid.UUID) uuid.UUID {
			calls[realmID]++
			if realmID == excludedRealm {
				return excludedDataset
			}
			return includedDataset
		},
	)

	require.Len(t, got, 1)
	require.Equal(t, groups[2].ID, got[0].ID)
	require.Equal(t, 2, excludedCount)
	require.Equal(t, 1, calls[excludedRealm], "repeated realms should resolve only once")
	require.Equal(t, 1, calls[includedRealm])
	require.Zero(t, calls[unvisitedRealm], "filtering should stop once the post-exclusion limit is filled")
}

func TestFilterGroupsByExcludedDataset_NoExclusionsStillAppliesLimit(t *testing.T) {
	t.Parallel()

	groups := []resynccandidate.Group{{ID: uuid.New()}, {ID: uuid.New()}}
	got, excludedCount := filterGroupsByExcludedDataset(groups, nil, 1, nil)
	require.Equal(t, groups[:1], got)
	require.Zero(t, excludedCount)
}

func TestResyncLogURL(t *testing.T) {
	t.Parallel()

	logID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	require.Equal(t,
		"https://legacy.chronicleclassic.com/logs/00000000-0000-0000-0000-000000000001",
		resyncLogURL("https://legacy.chronicleclassic.com", "", logID),
	)
	require.Equal(t,
		"https://turtle.chronicleclassic.com/logs/00000000-0000-0000-0000-000000000001",
		resyncLogURL("https://legacy.chronicleclassic.com/parser-version?ignored=true", "turtle", logID),
	)
	require.Equal(t,
		"http://localhost:4000/logs/00000000-0000-0000-0000-000000000001",
		resyncLogURL("http://localhost:4000", "turtle", logID),
	)
	require.Empty(t, resyncLogURL("not a URL", "turtle", logID))
}

func TestApprovalInsertOpts_IsolateQueue(t *testing.T) {
	t.Parallel()

	args := chronicle.ArgsResync{LogGroupID: uuid.New()}
	const approvalQueue = "resync-approve-test"
	opts := approvalInsertOpts(args, approvalQueue)

	require.Equal(t, approvalQueue, opts.Queue)
	require.NotEqual(t, riverconst.QueueResync, opts.Queue)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.True(t, opts.UniqueOpts.ByQueue, "approval jobs must not reuse a job from the persistent resync queue")
	require.Equal(t, 1, opts.MaxAttempts)
}
