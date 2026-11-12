package zone

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDifficultySnapshot(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		zone Zone
		want Difficulty
	}{
		{name: "legacy absent metadata", zone: Zone{}, want: ""},
		{name: "raid heroic index", zone: Zone{InstanceType: "raid", DifficultyIndex: 3, MaxPlayers: 10}, want: "heroic"},
		{name: "raid normal 25 index", zone: Zone{InstanceType: "raid", DifficultyIndex: 2, MaxPlayers: 25}, want: ""},
		{name: "dungeon heroic index", zone: Zone{InstanceType: "party", DifficultyIndex: 2, MaxPlayers: 5}, want: "heroic"},
		{
			name: "normal",
			zone: Zone{DifficultyName: "25 Player", MaxPlayers: 25},
			want: "",
		},
		{
			name: "dynamic heroic",
			zone: Zone{DifficultyName: "25 Player", MaxPlayers: 25, DynamicDifficulty: 1},
			want: "heroic",
		},
		{
			name: "qualified heroic label is preserved",
			zone: Zone{DifficultyName: "10 Player Heroic", MaxPlayers: 10, DynamicDifficulty: 1},
			want: "heroic",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, test.zone.DifficultySnapshot())
		})
	}
}
