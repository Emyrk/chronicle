package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/stretchr/testify/require"
)

func TestCommonFactoryMatchZoneFallsBackToMapID(t *testing.T) {
	t.Parallel()

	factory := &CommonFactory{
		Name:      "Temple of Ahn'Qiraj",
		ZoneNames: []string{"ahn'qiraj"},
		MapIDs:    []uint32{531},
	}

	require.True(t, factory.MatchZone(zone.Zone{Name: "ahn'qiraj temple", MapID: 531}))
	require.False(t, factory.MatchZone(zone.Zone{Name: "ahn'qiraj temple", MapID: 509}))
	require.True(t, factory.MatchZone(zone.Zone{Name: "ahn'qiraj", MapID: 0}))
}
