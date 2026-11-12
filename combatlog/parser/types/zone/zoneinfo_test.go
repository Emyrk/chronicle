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
		{
			name: "normal",
			zone: Zone{DifficultyName: "25 Player", MaxPlayers: 25},
			want: Difficulty{Name: "25 Player", MaxPlayers: 25},
		},
		{
			name: "dynamic heroic",
			zone: Zone{DifficultyName: "25 Player", MaxPlayers: 25, DynamicDifficulty: 1},
			want: Difficulty{Name: "25 Player (Heroic)", MaxPlayers: 25, DynamicDifficulty: 1},
		},
		{
			name: "qualified heroic label is preserved",
			zone: Zone{DifficultyName: "10 Player Heroic", MaxPlayers: 10, DynamicDifficulty: 1},
			want: Difficulty{Name: "10 Player Heroic", MaxPlayers: 10, DynamicDifficulty: 1},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.want, test.zone.DifficultySnapshot())
		})
	}
}
