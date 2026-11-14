package modern

import (
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

// Run with original legacy files restored by Go overlay as well as with the
// delegates. Compare exact normalized bytes and GUID dictionaries, not only
// success/error. No old parser or synthetic processing is used by the new path.
func TestNormalizationParity(t *testing.T) {
	t.Parallel()
	fixtures := []struct {
		format database.LogFormat
		lines  []string
	}{
		{database.LogFormatV9Cleu, []string{
			`9/3/2026 18:57:03.000-6  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1`,
			`9/3/2026 18:57:03.000-6  PARTY_KILL,Player-6065-049DF19A,"Player-Realm-US",0x514,0x0,Player-6065-03CAC527,"Target-Realm-US",0x511,0x0`,
			`9/3/2026 18:57:03.000-6  EMOTE,"ignored"`,
			`9/3/2026 18:57:03.000-6  SPELL_DAMAGE,Player-bad,"Name",0x1,0x0,nil,nil,0x0,0x0,1,"Spell",1`,
			"malformed",
		}},
		{database.LogFormatHermesproxy1142Cc, []string{
			`9/9 22:45:28.337  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1`,
			`9/9 22:45:28.337  SPELL_CAST_FAILED,Player-1-00004AAF,"Player-",0x511,0x0,0000000000000000,nil,0x80000000,0x80000000,23246,"Spell",0x1,"[1H:0.8,Test Realm,enUS,1.14.2,42597,da29,1788986746,120][2PPlayer-1-00004AAF;T1,1,230255]"`,
			`9/9 22:45:29.337  PARTY_KILL,Player-1-00004AAF,"Player-",0x511,0x0,Creature-0-1-0-0-10412-0000018B06,"Target",0xa48,0x0`,
		}},
	}
	for _, file := range []string{"wow_forever_v22_advanced.log", "wow_forever_v22_compound_resources.log"} {
		raw, err := os.ReadFile("testdata/" + file)
		require.NoError(t, err)
		fixtures = append(fixtures, struct {
			format database.LogFormat
			lines  []string
		}{database.LogFormatV22Cleu, strings.Split(strings.TrimSpace(string(raw)), "\n")})
	}
	for _, fixture := range fixtures {
		// Same wire format is deliberately exercised with different explicit flavors.
		for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorTBC}, {database.FlavorWoWForever}} {
			ctx := parsectx.With(t.Context(), parsectx.Context{Format: fixture.format, Flavor: flavor})
			decoder, err := next.NewNormalizer(ctx)
			require.NoError(t, err)
			old := newTransformReader(strings.NewReader(""))
			if fixture.format == database.LogFormatHermesproxy1142Cc {
				old = newHermesProxyTransformReader(strings.NewReader(""))
			}
			for _, line := range fixture.lines {
				want, wantErr := old.transform(line)
				got, gotErr := decoder.Normalize(line)
				if wantErr != nil {
					require.EqualError(t, gotErr, wantErr.Error())
				} else {
					require.NoError(t, gotErr)
				}
				require.Equal(t, want, got)
				wantMappings, gotMappings := old.guids.mappings(), decoder.GUIDMappings()
				require.Len(t, gotMappings, len(wantMappings))
				for i, wantMapping := range wantMappings {
					require.Equal(t, wantMapping.Canonical, gotMappings[i].Canonical)
					require.Equal(t, wantMapping.Compatibility, gotMappings[i].Compatibility)
				}
				require.Equal(t, fixture.format, decoder.Format())
				require.Equal(t, flavor, decoder.Flavor())
			}
		}
	}
}
