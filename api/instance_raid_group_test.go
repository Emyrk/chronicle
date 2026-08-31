package api

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func TestRaidGroupComposition(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	composition := raidgroups.Composition{{1, 0, 2}}
	players := map[guid.GUID]database.LogInstancePlayer{
		1: {UnitGuid: 1, Name: "Tank", Class: database.WowPlayableClassWARRIOR},
	}
	got := raidGroupComposition(at, composition, players)
	require.Len(t, got.Groups, 8)
	require.Len(t, got.Groups[0], 2)
	assert.Equal(t, guid.GUID(1), got.Groups[0][0].GUID)
	assert.Equal(t, "Tank", got.Groups[0][0].Name)
	assert.Equal(t, "WARRIOR", got.Groups[0][0].Class)
	assert.Equal(t, guid.GUID(2), got.Groups[0][1].GUID)
	assert.Empty(t, got.Groups[0][1].Name)
}
