package modern

import (
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/Emyrk/chronicle/database"
)

// Two resets of WoW Forever's City of Dalaran (map 2959). The zone records are
// identical; only the copy field of the creature GUIDs (20131, 86097) changes.
var dalaranTwoCopiesLog = []string{
	`11/15/2026 23:45:58.0791  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18`,
	`11/15/2026 23:45:58.6121  ZONE_CHANGE,2959,"Dalaran",1`,
	`11/15/2026 23:47:13.8871  SWING_DAMAGE,Player-1-00000001,"Tester-Realm-Normal-US",0x512,0x80000000,Creature-0-7052-2959-20131-255070-00007A354D,"Skeletal Warder",0x10a48,0x80000000,Player-1-00000001,0000000000000000,1509,1509,822,0,1617,0,0,0,0,2083,2163,0,255.30,352.61,1416,2.6415,28,58,94,-1,1,0,0,0,nil,1,nil`,
	`11/15/2026 23:47:30.4901  UNIT_DIED,0000000000000000,nil,0x80000000,0x80000000,Creature-0-7052-2959-20131-255070-00007A354D,"Skeletal Warder",0x10a48,0x80000000,0`,
	`11/16/2026 00:42:48.8971  ZONE_CHANGE,2959,"Dalaran",1`,
	`11/16/2026 00:44:05.9441  SWING_DAMAGE,Player-1-00000001,"Tester-Realm-Normal-US",0x10512,0x80000000,Creature-0-7073-2959-86097-255070-0000FA4372,"Skeletal Warder",0xa48,0x80000000,Player-1-00000001,0000000000000000,1688,1688,624,0,1835,0,0,0,1,93,1000,0,247.72,355.92,1416,2.4018,21,75,100,-1,1,0,0,0,nil,nil,nil`,
	`11/16/2026 00:44:31.5441  UNIT_DIED,0000000000000000,nil,0x80000000,0x80000000,Creature-0-7073-2959-86097-255070-0000FA4372,"Skeletal Warder",0x10a48,0x80000000,0`,
	`11/16/2026 00:47:23.3951  ENCOUNTER_START,3311,"Atrexis the Grave Knight",1,5,2959`,
}

func TestTransformV22ZoneChangeCarriesCreatureCopy(t *testing.T) {
	t.Parallel()

	converted, err := io.ReadAll(newTransformReader(strings.NewReader(strings.Join(dalaranTwoCopiesLog, "\n"))))
	require.NoError(t, err)

	var zones []string
	for line := range strings.SplitSeq(string(converted), "\n") {
		if _, zoneLine, ok := strings.Cut(line, "  BLIZZARD_ZONE_CHANGE,"); ok {
			zones = append(zones, zoneLine)
		}
	}
	require.Equal(t, []string{
		`2959,"Dalaran",1`,
		`2959,"Dalaran",1,20131`,
		// Re-entering keeps the known copy until a creature reveals a new one.
		`2959,"Dalaran",1,20131`,
		`2959,"Dalaran",1,86097`,
	}, zones)
}

func TestTransformV22IgnoresOpenWorldCopies(t *testing.T) {
	t.Parallel()

	// Open-world shards change the copy field; they must not look like resets.
	input := strings.Join([]string{
		`11/15/2026 23:40:00.0000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18`,
		`11/15/2026 23:40:01.0000  ZONE_CHANGE,1,"Kalimdor",0`,
		`11/15/2026 23:40:02.0000  UNIT_DIED,0000000000000000,nil,0x80000000,0x80000000,Creature-0-7069-1-42635-255070-00007A354D,"Skeletal Warder",0x10a48,0x80000000,0`,
		`11/15/2026 23:40:03.0000  UNIT_DIED,0000000000000000,nil,0x80000000,0x80000000,Creature-0-6821-1-1650-255070-00007A354E,"Skeletal Warder",0x10a48,0x80000000,0`,
	}, "\n")
	converted, err := io.ReadAll(newTransformReader(strings.NewReader(input)))
	require.NoError(t, err)
	require.Equal(t, 1, strings.Count(string(converted), "BLIZZARD_ZONE_CHANGE"))
	require.Contains(t, string(converted), `BLIZZARD_ZONE_CHANGE,1,"Kalimdor",0`+"\n")
}

func TestV22CreatureCopySplitsInstances(t *testing.T) {
	t.Parallel()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := registry.RegistryForFlavor(logger, database.WoWFlavor{database.FlavorVanilla, database.FlavorWoWForever})
	p, err := New(t.Context(), logger, strings.NewReader(strings.Join(dalaranTwoCopiesLog, "\n")), hermesProxyTestDB{}, hermesProxyTestDB{}, reg, database.LogFormatV22Cleu)
	require.NoError(t, err)

	state := encounters.New(t.Context(), logger, reg)
	advancer := reorder.New(p, ReorderWindow)
	for {
		msgs, err := advancer.Advance(t.Context())
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)
		for _, m := range msgs {
			require.NoError(t, state.Process(m))
		}
	}

	require.Len(t, state.Instances, 2)
	require.EqualValues(t, 20131, state.Instances[0].CurrentZone.CopyID)
	require.EqualValues(t, 86097, state.Instances[1].CurrentZone.CopyID)
	// The boss pull in the second reset must stay with the second copy.
	require.Same(t, state.Instances[1], state.CurrentInstance)
}
