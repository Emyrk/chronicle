package infrastructurecosts

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAllocateLargestRemainderDeterministic(t *testing.T) {
	t.Parallel()
	ids := []uuid.UUID{uuid.MustParse("00000000-0000-0000-0000-000000000002"), uuid.MustParse("00000000-0000-0000-0000-000000000001"), uuid.MustParse("00000000-0000-0000-0000-000000000003")}
	users := []UserActivity{{UserID: ids[0], UsernameSnapshot: "b", ActiveUploader: true, MonthlyParsedBytes: 1, CurrentParsedBytes: 0}, {UserID: ids[1], UsernameSnapshot: "a", ActiveUploader: true, MonthlyParsedBytes: 1, CurrentParsedBytes: 1}, {UserID: ids[2], UsernameSnapshot: "inactive", ActiveUploader: false, MonthlyParsedBytes: 0, CurrentParsedBytes: 1}}
	got, pools := Allocate(CategoryCosts{MemoryMicrodollars: 1, EgressMicrodollars: 2, CPUMicrodollars: 2, VolumeMicrodollars: 1, BackupMicrodollars: 2}, users)
	require.Len(t, got, 3)
	require.Equal(t, uuid.MustParse("00000000-0000-0000-0000-000000000001"), got[0].UserID)
	require.Equal(t, int64(2), got[0].SharedCostMicrodollars)
	require.Equal(t, int64(1), got[1].SharedCostMicrodollars)
	require.Equal(t, int64(0), got[2].SharedCostMicrodollars)
	require.Equal(t, int64(2), got[0].StorageCostMicrodollars)
	require.Equal(t, int64(1), got[2].StorageCostMicrodollars)
	require.Equal(t, int64(1), pools.InactiveStorageMicrodollars)
	var total int64
	for _, u := range got {
		total += u.TotalCostMicrodollars
	}
	require.Equal(t, int64(8), total)
	require.Zero(t, pools.UnattributedMicrodollars)
}

func TestAllocateLargestRemainderAvoidsProductOverflow(t *testing.T) {
	t.Parallel()
	got := allocateLargestRemainder(9_000_000, []int64{4_000_000_000_000, 2_000_000_000_000}, []string{"a", "b"})
	require.Equal(t, []int64{6_000_000, 3_000_000}, got)
}

func TestDailyUTCSchedule(t *testing.T) {
	t.Parallel()
	current := time.Date(2026, 11, 5, 23, 30, 0, 0, time.FixedZone("EST", -5*60*60))
	next := (DailyUTCSchedule{}).Next(current)
	require.Equal(t, time.Date(2026, 11, 7, 0, 15, 0, 0, time.UTC), next)
}

func TestAllocateUnattributedPools(t *testing.T) {
	t.Parallel()
	got, pools := Allocate(CategoryCosts{CPUMicrodollars: 9, VolumeMicrodollars: 4}, nil)
	require.Empty(t, got)
	require.Equal(t, int64(13), pools.UnattributedMicrodollars)
}
