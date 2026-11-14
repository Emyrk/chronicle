package modern

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	synthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestIndependentModernMessages(t *testing.T) {
	t.Parallel()
	cases := []struct {
		format database.LogFormat
		input  string
	}{
		{database.LogFormatV9Cleu, strings.Join([]string{
			`9/3/2026 18:57:03.000-6  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,0`,
			`9/3/2026 18:57:03.000-6  ENCOUNTER_START,601,"Boss",4,25,564,5`,
			`9/3/2026 18:57:04.000-6  WORLD_MARKER_PLACED,564,8,123.45,-67.89`,
			`9/3/2026 18:57:05.000-6  ENCOUNTER_END,601,"Boss",4,25,1`,
		}, "\n")},
		{database.LogFormatHermesproxy1142Cc, strings.Join([]string{
			`9/9 22:45:28.337  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1`,
			`9/9 22:45:28.337  SPELL_CAST_FAILED,Player-1-00004AAF,"Player-",0x511,0x0,0000000000000000,nil,0x80000000,0x80000000,23246,"Spell",0x1,"[1H:0.8,Test Realm,enUS,1.14.2,42597,da29,1788986746,120]"`,
		}, "\n")},
	}
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV9Cleu, `9/3/2026 18:57:03.000-6  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1` + "\n" + `9/3/2026 18:57:03.000-6  SPELL_DAMAGE,Player-6065-049DF19A,"Toptier-Nightslayer-US",0x514,0x80000000,Creature-0-6263-564-204635-22875-00021A0E65,"Coilskar Sea-Caller",0xa48,0x80000040,27157,"Judgement of Righteousness",0x2,Creature-0-6263-564-204635-22875-00021A0E65,0000000000000000,170803,172320,0,0,0,0,0,-1,0,0,0,230.18,946.42,339,3.0830,71,1012,1012,-1,2,0,0,0,nil,nil,nil,ST`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV9Cleu, `9/6/2026 19:17:33.739-6  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1` + "\n" + `9/6/2026 19:17:33.739-6  DAMAGE_SHIELD,Player-6065-047EBC96,"Aeliz-Nightslayer-US",0x40514,0x80000000,Creature-0-6263-564-439599-22952-00001E05CE,"Veras Darkshadow",0xa48,0x80000040,26992,"Thorns",0x8,Creature-0-6263-564-439599-22952-00001E05CE,0000000000000000,1742798,1746500,0,0,0,0,0,-1,0,0,0,679.25,313.82,339,3.5511,73,46,46,-1,8,0,0,0,nil,nil,nil,ST`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV9Cleu, `9/3/2026 18:58:00.398-6  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1` + "\n" + `9/3/2026 18:58:00.398-6  SPELL_ABSORBED,Creature-0-6263-564-204635-22878-00019A0E65,"Aqueous Lord",0x10a48,0x80000080,Player-6065-03CAC527,"Rewben-Nightslayer-US",0x40511,0x80000000,Player-6065-0432F380,"Robzumbie-Nightslayer-US",0x514,0x80000000,25218,"Power Word: Shield",0x2,2140,6661`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV9Cleu, `9/3/2026 18:58:06.299-6  COMBAT_LOG_VERSION,9,ADVANCED_LOG_ENABLED,1` + "\n" + `9/3/2026 18:58:06.299-6  SPELL_ABSORBED,Creature-0-6263-564-204635-22875-00021A0E65,"Coilskar Sea-Caller",0xa48,0x80000040,Player-6065-048F48CE,"Bradleyzeal-Nightslayer-US",0x514,0x80000000,40090,"Hurricane",0x8,Player-6065-0432F380,"Robzumbie-Nightslayer-US",0x514,0x80000000,25218,"Power Word: Shield",0x2,1852,1852`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV22Cleu, `9/23/2026 11:12:20.602-4  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1` + "\n" + `9/23/2026 11:12:20.602-4  SPELL_ABSORBED,Creature-0-4615-0-10340-267006-0000B3EC43,"Dark Neophyte",0xa28,0x80000000,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,9613,"Shadow Bolt",0x20,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,1310927,"Light's Fury",0x2,4,38,nil`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV22Cleu, `9/23/2026 11:12:27.557-4  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1` + "\n" + `9/23/2026 11:12:27.557-4  SPELL_ABSORBED,Creature-0-4615-0-10340-267006-0000B3EC43,"Dark Neophyte",0xa28,0x80000000,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,Player-4620-00D5496D,"Brother-ClassicBetaPvE2-",0x518,0x80000000,1310927,"Light's Fury",0x2,4,16,nil`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV22Cleu, `9/23/2026 12:16:14.185-4  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1` + "\n" + `9/23/2026 12:16:14.185-4  COMBATANT_INFO,Player-4620-006422B6,0,69,41,123,41,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1826,1486,[(105638,130362,3)],(0,0,0,0),[(250532,25,(),(),())],[],1,0,0,0`})
	cases = append(cases, struct {
		format database.LogFormat
		input  string
	}{database.LogFormatV22Cleu, `9/23/2026 12:16:14.185-4  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1` + "\n" + `9/23/2026 12:16:14.185-4  COMBATANT_INFO,Player-4620-006422B6,0,69,41,123,41,49,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1486,[(105638,130362,3)],(0,0,0,0),[(250532,25,(),(),())],[],1,0,0,0`})
	for _, file := range []string{"wow_forever_v22_advanced.log", "wow_forever_v22_compound_resources.log"} {
		raw, err := os.ReadFile("testdata/" + file)
		require.NoError(t, err)
		cases = append(cases, struct {
			format database.LogFormat
			input  string
		}{database.LogFormatV22Cleu, strings.TrimSpace(string(raw))})
	}
	for _, tc := range cases {
		ctx := parsectx.With(t.Context(), parsectx.Context{Format: tc.format, Flavor: database.WoWFlavor{database.FlavorWoWForever}})
		db := hermesProxyTestDB{}
		var old *Parser
		var err error
		if tc.format == database.LogFormatHermesproxy1142Cc {
			old, err = NewHermesProxy(ctx, slog.Default(), strings.NewReader(tc.input), db, db, nil)
		} else {
			old, err = New(ctx, slog.Default(), strings.NewReader(tc.input), db, db, nil, tc.format)
		}
		require.NoError(t, err)
		old.inner.SetBaseYear(2026)
		names := wotlk.NewGUIDNames() // test-only same consumer-side name storage
		cp := companion.New(slog.Default())
		decoded, err := next.NewDecoder(ctx, next.DecoderOptions{Spells: db, Hooks: cleu.Hooks{
			LookupSpell: func(id chrondbc.SpellID, _ ...string) *chrondbc.Spell {
				if id == 0 {
					return nil
				}
				sp, _ := db.Spell(context.Background(), id)
				return sp
			},
			RecordGUIDName: names.Record,
			DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
				if !companion.IsCompanionMessage(payload) {
					return nil, false, nil
				}
				msgs, err := cp.Feed(ts, payload)
				return msgs, true, err
			},
		}})
		require.NoError(t, err)
		// Synthetics are outside the decoder, with the existing modern options/order.
		synth := synthetic.NewWithOptions(ctx, slog.Default(), db, nil, names, synthetic.Options{CreditEarthShield: true, GenerateAbsorbs: false, DetectZone: false})
		var want, got []messages.Message
		for {
			batch, err := old.Advance(ctx)
			if err == io.EOF {
				break
			}
			require.NoError(t, err)
			want = append(want, batch...)
		}
		for _, line := range strings.Split(tc.input, "\n") {
			rawTS, _, err := cleu.SplitHeader(line)
			require.NoError(t, err)
			var ts time.Time
			if tc.format == database.LogFormatHermesproxy1142Cc {
				ts, err = time.Parse("2006/1/2 15:04:05.000", "2026/"+rawTS)
			} else {
				ts, err = next.ParseTimestamp(rawTS)
				ts = ts.UTC()
			}
			require.NoError(t, err)
			err = decoded.DecodeLineEach(ts, line, func(batch []messages.Message) error {
				processed, err := synth.ProcessMessages(batch)
				if err != nil {
					return err
				}
				got = append(got, processed...)
				return nil
			})
			require.NoError(t, err)
		}
		require.Equal(t, want, got, "format %s", tc.format)
		// Validate the actual raw-reader factory, including its V22 reorder stage.
		if tc.format == database.LogFormatHermesproxy1142Cc {
			old, err = NewHermesProxy(ctx, slog.Default(), strings.NewReader(tc.input), db, db, nil)
		} else {
			old, err = New(ctx, slog.Default(), strings.NewReader(tc.input), db, db, nil, tc.format)
		}
		require.NoError(t, err)
		old.inner.SetBaseYear(2026)
		var oldSource reorder.Advancer = old
		if tc.format == database.LogFormatV22Cleu {
			oldSource = reorder.New(old, ReorderWindow)
		}
		source, err := NewNext(ctx, slog.Default(), strings.NewReader(tc.input), db, db, nil)
		require.NoError(t, err)
		source.pipeline.year = 2026
		want = nil
		got = nil
		for {
			batch, err := oldSource.Advance(ctx)
			if err == io.EOF {
				break
			}
			require.NoError(t, err)
			want = append(want, batch...)
		}
		for {
			batch, err := source.Advance(ctx)
			if err == io.EOF {
				break
			}
			require.NoError(t, err)
			got = append(got, batch...)
		}
		require.Equal(t, want, got, "source format %s", tc.format)
		require.Equal(t, old.SawRaidGroup(), source.SawRaidGroup())
		require.Equal(t, old.GUIDMappings(), source.GUIDMappings())

	}
}

func TestIndependentModernMalformedMetadata(t *testing.T) {
	t.Parallel()
	for _, payload := range []string{
		"ZONE_CHANGE,bad,Zone,1", "WORLD_MARKER_PLACED,1,2,bad,0",
		"WORLD_MARKER_REMOVED,bad,2", "ENCOUNTER_START,bad,Boss,4,25",
		"ENCOUNTER_END,1,Boss,4", "COMBATANT_INFO,Player-1-00000001",
	} {
		ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormatV9Cleu, Flavor: database.WoWFlavor{database.FlavorTBC}})
		line := "9/3/2026 18:57:03.000-6  " + payload
		db := hermesProxyTestDB{}
		old, err := New(ctx, slog.Default(), strings.NewReader(line), db, db, nil, database.LogFormatV9Cleu)
		require.NoError(t, err)
		_, wantErr := old.Advance(ctx)
		require.Error(t, wantErr)
		decoder, err := next.NewDecoder(ctx, next.DecoderOptions{Spells: db, Hooks: cleu.Hooks{LookupSpell: func(id chrondbc.SpellID, _ ...string) *chrondbc.Spell { sp, _ := db.Spell(ctx, id); return sp }}})
		require.NoError(t, err)
		ts, err := next.ParseTimestamp("9/3/2026 18:57:03.000-6")
		require.NoError(t, err)
		_, gotErr := decoder.DecodeLine(ts.UTC(), line)
		require.EqualError(t, gotErr, wantErr.Error(), payload)
	}
}
