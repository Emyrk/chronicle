package combatant

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestRawRealmMergeUsesResolvedName(t *testing.T) {
	t.Parallel()
	existing := Combatant{Guid: guid.GUID(1), Name: "First", RawRealm: "Normal-US"}
	for _, name := range []string{"", "Unknown", "First", "Second"} {
		c := Combatant{Guid: existing.Guid, Name: name}
		c.MergeExisting(existing)
		if name == "Second" {
			require.Empty(t, c.RawRealm)
		} else {
			require.Equal(t, existing.RawRealm, c.RawRealm)
		}
	}
}
