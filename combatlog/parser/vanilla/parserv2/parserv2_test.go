package parserv2

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Gophercraft/core/i18n"
	"github.com/google/uuid"
	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/rs/zerolog"
	slogzerolog "github.com/samber/slog-zerolog/v2"
	"github.com/stretchr/testify/require"
)

// testSpellDB creates a WoWDB from the server-specific Spell.dbc for testing.
// Skips the test if the file doesn't exist (allows tests to run without it).
func testSpellDB(t *testing.T) gamedb.GameDB {
	t.Helper()
	dbcPath := filepath.Join("..", "..", "..", "..", "assets", services.ServerName, "Spell.dbc")
	if _, err := os.Stat(dbcPath); os.IsNotExist(err) {
		t.Skipf("%s not found, skipping test requiring spell database", dbcPath)
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

// testCaseWithDB parses line with a GameDB and asserts result matches expected
func testCaseWithDB[T messages.Message](t *testing.T, line string, expected T, wowDB gamedb.GameDB) {
	t.Helper()
	ctx := context.Background()

	zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
	logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())

	p, err := New(context.Background(), logger, strings.NewReader(line), wowDB, nil)
	require.NoError(t, err)
	msgs, err := p.Advance(ctx)
	require.NoError(t, err)

	x := reflect.ValueOf(expected)
	if x.IsZero() || x.IsNil() {
		require.Len(t, msgs, 0, "expected no message, got %d", len(msgs))
		return
	}

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
		t.Skip("now returns 2 messages")
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
				MessageBase:     messages.Base(time.UnixMilli(1772303384280)),
				Spell:           nil,
				Caster:          0x0000000000060A11,
				Target:          ptr.Ref(guid.GUID(0xF130003E76015AED)),
				Effect:          chrondbc.EffectApplyAura,
				Amplitude:       0,
				EffectAuraName:  87,
				DurationMS:      15000,
				AuraCapStatus:   2,
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
					MaxHealth:    3117,
					Buffs:        []unitinfo.Buff{},
					Level:        60,
					Challenges:   []string{},
				},
			},
		)
	})

	t.Run("ZoneInfoEmptyInstanceID", func(t *testing.T) {
		t.Parallel()

		testCase(t,
			"1778208220441|ZONE_INFO|Tower of Karazhan||1|raid|0",
			&messages.Zone{
				MessageBase: messages.Base(time.UnixMilli(1778208220441)),
				Zone: zone.Zone{
					Seen:         time.UnixMilli(1778208220441),
					Name:         "tower of karazhan",
					InstanceID:   0,
					Ghost:        false,
					InstanceType: "raid",
					IsInstance:   true,
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

	t.Run("Spell Fail", func(t *testing.T) {
		t.Parallel()

		testCase(t,
			"1771770885937|SPELL_FAIL|0x000000000001C80A|15237",
			&messages.SpellFail{
				MessageBase:    messages.Base(time.UnixMilli(1771770885937)),
				SpellData:      nil, // ignored in comparison
				Caster:         guid.GUID(0x000000000001C80A),
				FailedByServer: true,
			},
		)

		testCase(t,
			"1771770885937|SPELL_FAIL|0x000000000001C80A|15237|true",
			&messages.SpellFail{
				MessageBase:    messages.Base(time.UnixMilli(1771770885937)),
				SpellData:      nil, // ignored in comparison
				Caster:         guid.GUID(0x000000000001C80A),
				FailedByServer: true,
			},
		)

		testCase[*messages.SpellFail](t,
			"1771770885937|SPELL_FAIL|0x000000000001C80A|15237|false",
			nil,
		)
		testCase[*messages.SpellFail](t,
			"1771770885937|SPELL_FAIL|15237|false|35",
			nil,
		)
	})

	t.Run("Loot", func(t *testing.T) {
		testCase(t,
			"1775358110340|LOOT|Cielcin||cffffffff|Hitem:61760:0:0:0|h[Burnt Copy of \"Vorgendor\"]|h|r\n",
			&messages.Loot{
				MessageBase:  messages.Base(time.UnixMilli(1775358110340)),
				PlayerName:   "Cielcin",
				ItemName:     `Burnt Copy of "Vorgendor"`,
				ItemID:       61760,
				ItemSuffixID: 0,
				Quantity:     1,
			},
		)

		testCase(t,
			"1775355374273|LOOT|Defen||cffffffff|Hitem:14047:0:0:0|h[Runecloth]|h|rx3",
			&messages.Loot{
				MessageBase:  messages.Base(time.UnixMilli(1775355374273)),
				PlayerName:   "Defen",
				ItemName:     `Runecloth`,
				ItemID:       14047,
				ItemSuffixID: 0,
				Quantity:     3,
			})

		testCase(t,
			"1775356811498|LOOT_TRADE|Jimmythehand trades item Bloodfang Spaulders to Eithinis.",
			&messages.LootTrade{
				MessageBase:    messages.Base(time.UnixMilli(1775356811498)),
				FromPlayerName: "Jimmythehand",
				ToPlayerName:   "Eithinis",
				ItemName:       "Bloodfang Spaulders",
			})
	})

	//t.Run("MissPeriodicAoE", func(t *testing.T) {
	//	t.Parallel()
	//
	//	testCase(t,
	//		"1775497576300|MISS|0xF1300030B40BA62E|0x00000000005DCB3F|22275|2",
	//		&messages.Damage{
	//			MessageBase:     messages.Base(time.UnixMilli(1775497574472)),
	//			SpellName:       ptr.Ref("Flamestrike"),
	//			Caster:          ptr.Ref(guid.GUID(0xF140095BCD00000F)),
	//			Target:          0xF1300030B40BA62E,
	//			HitType:         0,
	//			Amount:          0,
	//			School:          0,
	//			Trailer:         nil,
	//			EnvironmentType: nil,
	//		})
	//})

	// 1775497574472|SPELL_DMG|0xF140095BCD00000F|0xF1300030B40BA62E|22275|69|0,0,0|0|2|2,27,0,3

	t.Run("SpellDmgPartialResist", func(t *testing.T) {
		t.Parallel()
		t.Skip("spell name")

		// 1083 damage dealt, 1082 resisted → ~50% resist
		// Format: ts|SPELL_DMG|target|caster|spellID|amount|blocked,absorbed,resisted|hitInfo|school|effects
		testCase(t,
			"1778212906931|SPELL_DMG|0x0000000000099515|0xF13000F1FF276A34|51099|1083|0,0,1082|0|6|2,0,0,0",
			&messages.Damage{
				MessageBase: messages.Base(time.UnixMilli(1778212906931)),
				SpellName:   ptr.Ref("Arcane Bomb"),
				SpellData:   nil, // ignored (compared via cmpopts)
				Caster:      ptr.Ref(guid.GUID(0xF13000F1FF276A34)),
				Target:      guid.GUID(0x0000000000099515),
				HitType:     types.HitTypeHit,
				Amount:      1083,
				School:      types.ArcaneSchool, // school=6 → Arcane
				Trailer: types.Trailer{
					{Amount: ptr.Ref(uint32(1082)), HitType: types.HitTypePartialResist},
				},
			},
		)
	})

	t.Run("ManaBurn", func(t *testing.T) {
		t.Parallel()

		// Mana Burn (SPELL_EFFECT_POWER_BURN, effect 62) drains the target's
		// mana and deals 0.5 damage per mana drained (EffectAmplitude). The
		// server never logs the mana drained, so the parser synthesizes a
		// ResourceChange from the pre-mitigation damage. Here the damage was
		// fully absorbed by a shield (458 absorbed, 0 dealt) — 458 / 0.5 =
		// 916 mana was still burned.
		//
		// Uses a stub GameDB instead of the real Spell.dbc so the test works
		// regardless of build tags (the azerothcore DBC has different spell
		// data for this ID).
		ctx := context.Background()
		zerologLogger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})
		logger := slog.New(slogzerolog.Option{Level: slog.LevelDebug, Logger: &zerologLogger}.NewZerologHandler())

		manaBurnSpell := manaBurnSpell()
		db := &stubGameDB{spells: map[chrondbc.SpellID]*chrondbc.Spell{
			10876: manaBurnSpell,
		}}

		p, err := New(ctx, logger,
			strings.NewReader("1784050453916|SPELL_DMG|0xF130006287017F8B|0x000000000001D795|10876|0|458,0,0|0|5|62,0,0,0"),
			db, nil)
		require.NoError(t, err)
		msgs, err := p.Advance(ctx)
		require.NoError(t, err)
		require.Len(t, msgs, 2, "expected Damage + synthetic ResourceChange")

		dmg, ok := msgs[0].(*messages.Damage)
		require.True(t, ok, "expected *messages.Damage, got %T", msgs[0])
		require.Equal(t, int32(0), dmg.Amount)
		require.Equal(t, types.Trailer{
			{Amount: ptr.Ref(uint32(458)), HitType: types.HitTypePartialAbsorb},
		}, dmg.Trailer)

		rc, ok := msgs[1].(*messages.ResourceChange)
		require.True(t, ok, "expected *messages.ResourceChange, got %T", msgs[1])
		require.True(t, rc.IsSynthetic())
		require.Equal(t, guid.GUID(0xF130006287017F8B), rc.Target)
		require.Equal(t, ptr.Ref(guid.GUID(0x000000000001D795)), rc.Caster)
		require.Equal(t, int32(916), rc.Amount)
		require.Equal(t, types.ResourceMana, rc.Resource)
		require.Equal(t, types.ChangeDirectionLoss, rc.Direction)
		require.Equal(t, ptr.Ref("Mana Burn"), rc.SpellName)
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

// stubGameDB is a minimal gamedb.GameDB for tests that need specific spell data
// without loading a real Spell.dbc (which varies by build tag / server).
type stubGameDB struct {
	spells map[chrondbc.SpellID]*chrondbc.Spell
}

func (s *stubGameDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if sp, ok := s.spells[id]; ok {
		return sp, nil
	}
	return nil, chrondbc.SpellNotFound(id)
}

func (s *stubGameDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return nil, nil
}

func (s *stubGameDB) ResolveGear(_ []combatant.GearItem) {}

func (s *stubGameDB) Creature(int32) (*database.WorldCreatureTemplate, bool) {
	return nil, false
}

func (s *stubGameDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, nil
}

func (s *stubGameDB) ExtraAttackSpell(context.Context, int32) (dbcmem.ExtraAttackSpell, bool) {
	return dbcmem.ExtraAttackSpell{}, false
}

func (s *stubGameDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return &chrondbc.DurationModifierSet{}, nil
}

func (s *stubGameDB) PeriodicSpells(context.Context) (map[int32]dbcmem.PeriodicSpell, error) {
	return nil, nil
}

// manaBurnSpell returns a hand-crafted Mana Burn Rank 5 (ID 10876) with the
// fields required by powerBurnResourceChange: EffectPowerBurn in effect slot 0,
// EffectAmplitude 0.5, and EffectMiscValue 0 (mana).
func manaBurnSpell() *chrondbc.Spell {
	sp := &chrondbc.Spell{
		ID: 10876,
	}
	sp.Name_lang = i18n.Text{i18n.English: "Mana Burn"}
	sp.Effect = [3]chrondbc.Effect{chrondbc.EffectPowerBurn, 0, 0}
	sp.EffectAmplitude = [3]float32{0.5, 0, 0}
	sp.EffectMiscValue = [3]int32{0, 0, 0} // 0 = mana
	return sp
}
