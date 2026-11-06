package wdb

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
)

func testTransmogItem(entry, displayID int32) database.WorldItemTemplate {
	return database.WorldItemTemplate{
		Entry:                     entry,
		Name:                      "Blade of Infinite Mysteries",
		Description:               "Forged from glass smelted from the very sands of time that flow in the Caverns of Time.",
		Class:                     2,
		Subclass:                  7,
		DisplayID:                 displayID,
		Quality:                   4,
		Flags:                     65536,
		BuyPrice:                  339456,
		SellPrice:                 84864,
		InventoryType:             21,
		AllowableClass:            -1,
		AllowableRace:             -1,
		ItemLevel:                 65,
		RequiredReputationFaction: 1007,
		RequiredReputationRank:    7,
		MaxCount:                  1,
		Stackable:                 1,
		StatType1:                 5,
		StatValue1:                6,
		StatType2:                 7,
		StatValue2:                6,
		Delay:                     1900,
		DmgMin1:                   50,
		DmgMax1:                   108,
		Spellid1:                  23727,
		Spellid2:                  18054,
		Bonding:                   1,
		Material:                  1,
		Sheath:                    3,
		MaxDurability:             105,
	}
}

func TestIsLikelySyntheticTransmog(t *testing.T) {
	t.Parallel()

	base := database.WorldItemTemplate{
		Entry:         3346,
		Name:          "Monster - Item, Shovel",
		Class:         2,
		Subclass:      14,
		DisplayID:     743,
		Quality:       1,
		InventoryType: 17,
		Bonding:       0,
		Delay:         2000,
		DmgMin1:       1,
		DmgMax1:       2,
	}

	tests := []struct {
		name      string
		observed  database.WorldItemTemplate
		candidate database.WorldItemTemplate
		want      bool
	}{
		{
			name: "high ID clone with transmog display and binding",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.DisplayID = 12345
				item.Bonding = 1
				return item
			}(),
			candidate: base,
			want:      true,
		},
		{
			name:      "higher synthetic ID can match a lower synthetic-range entry",
			observed:  testTransmogItem(1005053, 40066),
			candidate: testTransmogItem(100529, 66389),
			want:      true,
		},
		{
			name:      "lower entry is never rejected in favor of a higher entry",
			observed:  testTransmogItem(100529, 66389),
			candidate: testTransmogItem(1005053, 40066),
		},
		{
			name: "low observed ID is ignored",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 99999
				item.DisplayID = 12345
				item.Bonding = 1
				return item
			}(),
			candidate: base,
		},
		{
			name: "different gameplay field is not a clone",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.DisplayID = 12345
				item.Bonding = 1
				item.Delay++
				return item
			}(),
			candidate: base,
		},
		{
			name: "same high ID shape without BOP is not synthetic",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.DisplayID = 12345
				return item
			}(),
			candidate: base,
		},
		{
			name: "different name is not a collision",
			observed: func() database.WorldItemTemplate {
				item := base
				item.Entry = 103346
				item.Name = "Custom Shovel"
				item.DisplayID = 12345
				item.Bonding = 1
				return item
			}(),
			candidate: base,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := IsLikelySyntheticTransmog(tt.observed, tt.candidate); got != tt.want {
				t.Fatalf("IsLikelySyntheticTransmog() = %t, want %t", got, tt.want)
			}
		})
	}
}

func TestSyntheticTransmogEntriesKeepsLowestMatchingEntry(t *testing.T) {
	t.Parallel()

	canonical := testTransmogItem(61006, 33145)
	distinct := testTransmogItem(120000, 12345)
	distinct.Delay++
	items := []database.WorldItemTemplate{
		testTransmogItem(1005053, 40066),
		testTransmogItem(142784, 32443),
		distinct,
		canonical,
		testTransmogItem(100529, 66389),
	}

	got := SyntheticTransmogEntries(items)
	for _, entry := range []int32{100529, 142784, 1005053} {
		if _, ok := got[entry]; !ok {
			t.Errorf("entry %d was not classified as synthetic", entry)
		}
	}
	for _, entry := range []int32{canonical.Entry, distinct.Entry} {
		if _, ok := got[entry]; ok {
			t.Errorf("entry %d was incorrectly classified as synthetic", entry)
		}
	}
}
