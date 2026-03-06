package parserv2

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"
	"github.com/stretchr/testify/require"
)

// testSpellDB creates a WoWDB from assets/Spell.dbc for testing.
// Skips the test if the file doesn't exist (allows tests to run without it).
func testSpellDB(t *testing.T) gamedb.SpellFetcher {
	t.Helper()
	dbcPath := "../../../../assets/Spell.dbc"
	if _, err := os.Stat(dbcPath); os.IsNotExist(err) {
		t.Skip("assets/Spell.dbc not found, skipping test requiring spell database")
	}

	ctx := context.Background()
	db, err := gamedb.New(ctx, gamedb.Options{
		SpellsDBCPath: dbcPath,
	})
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// testCase parses line and asserts result matches expected message
func testCase[T messages.Message](t *testing.T, line string, expected T) {
	t.Helper()
	testCaseWithDB[T](t, line, expected, testSpellDB(t))
}

// testCaseWithDB parses line with a SpellFetcher and asserts result matches expected
func testCaseWithDB[T messages.Message](t *testing.T, line string, expected T, wowDB gamedb.SpellFetcher) {
	t.Helper()
	ctx := context.Background()

	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())

	p, err := New(logger, strings.NewReader(line), wowDB)
	require.NoError(t, err)
	msgs, err := p.Advance(ctx)
	require.NoError(t, err)
	require.Len(t, msgs, 1, "expected single message, got %d", len(msgs))

	got, ok := msgs[0].(T)
	require.True(t, ok, "expected %T, got %T", expected, msgs[0])

	// Compare with cmp.Diff, ignoring:
	// - *chrondbc.Spell: spell data from DBC is large and not meaningful to compare
	// - unexported fields in MessageBase (activity map used for debugging)
	diff := cmp.Diff(expected, got,
		cmpopts.IgnoreTypes(&chrondbc.Spell{}),
		cmpopts.IgnoreUnexported(messages.MessageBase{}),
	)
	if diff != "" {
		t.Errorf("message mismatch (-expected +got):\n%s", diff)
	}
}

func TestParserMessages(t *testing.T) {
	t.Parallel()

	t.Run("Death", func(t *testing.T) {
		t.Parallel()

		testCase(t,
			"1771959313535|DEATH|0xF130002D9900DE15",
			&messages.Slain{
				MessageBase: messages.Base(time.UnixMilli(1771959313535)),
				Victim:      guid.GUID(0xF130002D9900DE15),
				Attribution: (*messages.Damage)(nil),
			})
	})

	t.Run("Header", func(t *testing.T) {
		t.Parallel()
		ts := time.Date(2026, 2, 23, 18, 17, 5, 0, time.UTC)

		testCase(t,
			"0|HEADER|0x0000000000432A74|Nordanaar|Ragefire Chasm|0.5|1.5||1771083771|1.18.0|7234|Dec 19 2025|23.02.26 19:17:05|23.02.26 18:17:05|200",
			&messages.Realm{
				MessageBase: messages.Base(ts),
				Info: realm.Info{
					Seen:      ts,
					Version:   "1.18.0",
					Build:     7234,
					BuildDate: "Dec 19 2025",
					RealmName: "Nordanaar",
				},
			},
		)
	})

	t.Run("Hemorrhage", func(t *testing.T) {
		t.Parallel()

		testCaseWithDB(t,
			"1772303384280|AURA_CAST|16511|0x0000000000060A11|0xF130003E76015AED|6|87|0|1|15000|2",
			&messages.AuraCast{
				MessageBase:    messages.Base(time.UnixMilli(1772303384280)),
				Caster:         0x0000000000060A11,
				Target:         ptr.Ref(guid.GUID(0xF130003E76015AED)),
				Effect:         chrondbc.EffectApplyAura,
				Amplitude:      0,
				EffectAuraName: 87,
				DurationMS:     15000,
				AuraCapStatus:  2,
				EffectMiscValue: 1,
			},
			testSpellDB(t),
		)

		testCaseWithDB(t,
			"1771958131349|AURA_CAST|29166|0x0000000000356F4A|0x00000000005542BE|6|110|0|0|20000|0",
			&messages.AuraCast{
				MessageBase:    messages.Base(time.UnixMilli(1771958131349)),
				Caster:         0x0000000000356F4A,
				Target:         ptr.Ref(guid.GUID(0x00000000005542BE)),
				Effect:         chrondbc.EffectApplyAura,
				Amplitude:      0,
				EffectAuraName: 110,
				DurationMS:     20000,
				AuraCapStatus:  0,
			},
			testSpellDB(t),
		)
	})

	t.Run("SwingMiss", func(t *testing.T) {
		t.Parallel()

		testCase(t,
			"1771564197000|SWING|0x000000000001C7AC|0xF130002C3800949C|194|2|1|1|0|0|0   ",
			&messages.Damage{
				MessageBase: messages.Base(time.UnixMilli(1771564197000)),
				SpellName:   ptr.Ref("Auto Attack"),
				Caster:      ptr.Ref(guid.GUID(0x000000000001C7AC)),
				Target:      guid.GUID(0xF130002C3800949C),
				Amount:      194, // subDamage adds to amount
				HitType:     types.HitTypeHit,
				School:      types.PhysicalSchool,
				Trailer:     nil,
			},
		)
	})

	t.Run("SwingCrit", func(t *testing.T) {
		t.Parallel()
		// SwingHitInfo=130 (HITINFO_AFFECTS_VICTIM | HITINFO_CRITICALHIT) + VictimState=1 = Crit
		testCase(t,
			"1771542038|SWING|0xF130002C3600BE05|0x000000000001C80A|100|130|1|0|0|0|0",
			&messages.Damage{
				MessageBase: messages.Base(time.UnixMilli(1771542038)),
				SpellName:   ptr.Ref("Auto Attack"),
				Caster:      ptr.Ref(guid.GUID(0xF130002C3600BE05)),
				Target:      guid.GUID(0x000000000001C80A),
				Amount:      100,
				HitType:     types.HitTypeCrit,
				School:      types.PhysicalSchool,
				Trailer:     nil,
			},
		)
	})

	t.Run("UnitInfo", func(t *testing.T) {
		t.Parallel()

		// Format: timestamp|UNIT_INFO|guid|isPlayer|name|canCooperate|owner|buffs|level|challenges|maxHealth
		testCase(t,
			"1771563953000|UNIT_INFO|0x000000000001C80A|1|Priests|1|||60||3117",
			&messages.Unit{
				MessageBase: messages.Base(time.UnixMilli(1771563953000)),
				Info: unitinfo.Info{
					Seen:         time.UnixMilli(1771563953000),
					Guid:         guid.GUID(0x000000000001C80A),
					IsPlayer:     true,
					Name:         "Priests",
					CanCooperate: true,
					Owner:        nil,
					Buffs:        []unitinfo.Buff{},
					Level:        60,
					Challenges:   []string{},
				},
			},
		)
	})

	t.Run("Spell Go", func(t *testing.T) {
		t.Parallel()

		testCase(t,
			"1771770885937|SPELL_GO|0|15237|0x000000000001C80A|0x0000000000000000|256|0|1",
			&messages.SpellGo{
				MessageBase:      messages.Base(time.UnixMilli(1771770885937)),
				ItemID:           nil, // 0 means no item
				SpellData:        nil, // ignored in comparison
				Caster:           guid.GUID(0x000000000001C80A),
				Target:           nil, // 0x0000000000000000 means no target
				Flags:            types.CastFlags(256),
				NumTargetsHit:    0,
				NumTargetsMissed: 1,
				CorpseOwner:      nil,
			},
		)
	})
	// Add more test cases:
	// t.Run("Heal", func(t *testing.T) {
	// 	t.Parallel()
	// 	testCaseWithDB(t,
	// 		"1771542037|HEAL|0x000000000001C80A|0x000000000001C80A|27805|507|0|0",
	// 		&messages.Heal{...},
	// 		wowDB,
	// 	)
	// })
}
