package infrastructurecosts

import (
	"cmp"
	"math/big"
	"slices"
)

type remainder struct {
	index     int
	remainder int64
	key       string
}

func allocateLargestRemainder(total int64, weights []int64, keys []string) []int64 {
	out := make([]int64, len(weights))
	if total <= 0 || len(weights) == 0 {
		return out
	}
	var sum int64
	for _, w := range weights {
		if w > 0 {
			sum += w
		}
	}
	if sum == 0 {
		return out
	}
	rs := make([]remainder, 0, len(weights))
	var assigned int64
	bigTotal := big.NewInt(total)
	bigSum := big.NewInt(sum)
	for i, w := range weights {
		if w <= 0 {
			continue
		}
		product := new(big.Int).Mul(bigTotal, big.NewInt(w))
		quotient, rem := new(big.Int), new(big.Int)
		quotient.QuoRem(product, bigSum, rem)
		out[i] = quotient.Int64()
		assigned += out[i]
		rs = append(rs, remainder{i, rem.Int64(), keys[i]})
	}
	slices.SortFunc(rs, func(a, b remainder) int {
		if c := cmp.Compare(b.remainder, a.remainder); c != 0 {
			return c
		}
		return cmp.Compare(a.key, b.key)
	})
	for i := int64(0); i < total-assigned; i++ {
		out[rs[i%int64(len(rs))].index]++
	}
	return out
}

func Allocate(costs CategoryCosts, activity []UserActivity) ([]UserAllocation, CostPools) {
	slices.SortFunc(activity, func(a, b UserActivity) int { return cmp.Compare(a.UserID.String(), b.UserID.String()) })
	shared := costs.MemoryMicrodollars + costs.EgressMicrodollars + costs.UnclassifiedMicrodollars
	activityPool := costs.CPUMicrodollars
	storage := costs.VolumeMicrodollars + costs.BackupMicrodollars
	keys := make([]string, len(activity))
	sharedW := make([]int64, len(activity))
	activityW := make([]int64, len(activity))
	storageW := make([]int64, len(activity))
	for i, u := range activity {
		keys[i] = u.UserID.String()
		if u.ActiveUploader {
			sharedW[i] = 1
		}
		activityW[i] = u.MonthlyParsedBytes
		storageW[i] = u.CurrentParsedBytes
	}
	sharedA := allocateLargestRemainder(shared, sharedW, keys)
	activityA := allocateLargestRemainder(activityPool, activityW, keys)
	storageA := allocateLargestRemainder(storage, storageW, keys)
	out := make([]UserAllocation, len(activity))
	pools := CostPools{SharedMicrodollars: shared, ActivityMicrodollars: activityPool, StorageMicrodollars: storage}
	var allocated int64
	for i, u := range activity {
		total := sharedA[i] + activityA[i] + storageA[i]
		out[i] = UserAllocation{u.UserID, u.UsernameSnapshot, u.ActiveUploader, u.UploadedFiles, u.MonthlyParsedBytes, u.CurrentParsedBytes, sharedA[i], activityA[i], storageA[i], total}
		allocated += total
		if !u.ActiveUploader {
			pools.InactiveStorageMicrodollars += storageA[i]
		}
	}
	pools.UnattributedMicrodollars = costs.Total() - allocated
	return out, pools
}
