package parserv2

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/gamedataoverrides"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestNextSourceSyntheticBoundaryParity(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat112aCcAddon})
	spell := &chrondbc.Spell{ID: 17, Effects: []chrondbc.SpellEffect{{Effect: chrondbc.EffectApplyAura, EffectAura: chrondbc.AuraEffectSchoolAbsorb}}}
	db := &stubGameDB{spells: map[chrondbc.SpellID]*chrondbc.Spell{17: spell}}
	lines := []string{
		"10000|AURA_CAST|17|0x0000000000000001|0x0000000000000002|6|69|0|127|30000|0",
		"10050|BUFF_ADD|0x0000000000000002|0|17|1|1|0|0",
		"10051|SPELL_DMG|0x0000000000000002|0x0000000000000001|17|100|50,0,0|0|0|2,0,0,0",
		"10052|DEATH|0x0000000000000002",
		nextCombatantInfo("1001853", ""),
		"10052|COMBATANT_TRANSMOG|Player|1:33440:61053",
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	old, err := New(ctx, logger, strings.NewReader(strings.Join(lines, "\n")), db, nil)
	require.NoError(t, err)
	pipeline, err := nextsource.New(ctx, logger, db, nil, version.GitTag)
	require.NoError(t, err)
	var all []messages.Message
	for _, line := range lines {
		source, err := pipeline.OpenFile(strings.NewReader(line), 4096)
		require.NoError(t, err)
		want, wantErr := old.Advance(ctx)
		got, gotErr := source.Advance(ctx)
		require.NoError(t, wantErr)
		require.NoError(t, gotErr)
		require.Equal(t, want, got)
		all = append(all, got...)
		_, err = source.Advance(ctx)
		require.ErrorIs(t, err, io.EOF)
		require.EqualValues(t, 1, source.Summary().Lines)
	}
	require.NotNil(t, all[1].(*messages.Aura).Source)
	require.IsType(t, &messages.Absorbed{}, all[3])
	require.NotNil(t, all[4].(*messages.Slain).Attribution)
}

func TestNextSourceTelemetryBatchParity(t *testing.T) {
	t.Parallel()
	lines := []string{
		"10000|UNIT_TARGET|0xF130002D9900DE15|0x000000000001C80A",
		"9500|UNIT_COMBAT|0xF130002D9900DE15|1",
		"9500|RAID_MARK|0xF130002D9900DE15|8",
		"9500|THREAT|0xF130002D9900DE15|Onyxia|self|Koniz:1:157:100:0;Mage:0:80:50.5:1;",
		"9500|THREAT_TANK|self|Onyxia:123456:Koniz:100;",
		"9500|UNIT_TARGET|0xF130002D9900DE15|",
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	db := &stubGameDB{}
	input := strings.Join(lines, "\n")
	old, err := New(t.Context(), logger, strings.NewReader(input), db, nil)
	require.NoError(t, err)
	pipeline, err := nextsource.New(t.Context(), logger, db, nil, "")
	require.NoError(t, err)
	source, err := pipeline.OpenFile(strings.NewReader(input), 4096)
	require.NoError(t, err)
	for i := range lines {
		want, wantErr := old.Advance(t.Context())
		got, gotErr := source.Advance(t.Context())
		require.NoError(t, wantErr, "line %d", i+1)
		require.NoError(t, gotErr, "line %d", i+1)
		require.Equal(t, want, got, "line %d", i+1)
	}
	_, err = old.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
	_, err = source.Advance(t.Context())
	require.ErrorIs(t, err, io.EOF)
}

func TestNextSourceMissedSpellLookupDistinction(t *testing.T) {
	t.Parallel()
	lines := []string{
		"1|HEAL|0x0000000000000001|0x0000000000000002|123|100|0|0",
		"1|ENERGIZE|0x0000000000000001|0x0000000000000002|124|0|1|0",
		"1|BUFF_ADD|0x0000000000000001|0|125|1|1|0|1",
		"1|SPELL_FAIL|0x0000000000000001|126|true",
		"1|SPELL_FAIL|client|127|false",
		"1|SPELL_START|0|128|0x0000000000000001|0x0000000000000002|0|100",
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	old, err := New(t.Context(), logger, strings.NewReader(strings.Join(lines, "\n")), &stubGameDB{}, nil)
	require.NoError(t, err)
	pipeline, err := nextsource.New(t.Context(), logger, &stubGameDB{}, nil, "")
	require.NoError(t, err)
	source, err := pipeline.OpenFile(strings.NewReader(strings.Join(lines, "\n")), 4096)
	require.NoError(t, err)
	for range lines {
		want, wantErr := old.Advance(t.Context())
		got, gotErr := source.Advance(t.Context())
		if wantErr != nil {
			require.EqualError(t, gotErr, wantErr.Error())
		} else {
			require.NoError(t, gotErr)
			require.Equal(t, want, got)
		}
	}
	require.Len(t, old.MissedSpells(), 2)
	require.Len(t, pipeline.MissedSpells(), 2)
	for id, entry := range old.MissedSpells() {
		require.Equal(t, entry.Count, pipeline.MissedSpells()[id].Count)
	}
	require.Contains(t, pipeline.MissedSpells(), chrondbc.SpellID(123))
	require.Contains(t, pipeline.MissedSpells(), chrondbc.SpellID(128))
}

type sourceCollector struct{ events []messages.Message }

func (c *sourceCollector) Process(m messages.Message) error {
	c.events = append(c.events, m)
	return nil
}

type sourceFailure struct{}

func (sourceFailure) Read([]byte) (int, error) { return 0, errors.New("broken input") }

func TestNextSourceExistingConsumers(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pipeline, err := nextsource.New(t.Context(), logger, &stubGameDB{}, nil, "")
	require.NoError(t, err)
	source, err := pipeline.OpenFile(strings.NewReader("1|SPELL_FAIL|client\n1|COMBAT_END\n2|DEATH|0x0000000000000001"), 4096)
	require.NoError(t, err)
	collector := &sourceCollector{}
	fanout := consumers.New(logger, collector)
	fanout.Advancer = source
	require.NoError(t, fanout.ConsumeAll(t.Context(), source))
	require.Len(t, collector.events, 2)
	require.Contains(t, fanout.Times(), "parser.synthetics")
	broken, err := pipeline.OpenFile(io.MultiReader(strings.NewReader("3|COMBAT_END\n"), sourceFailure{}), 4096)
	require.NoError(t, err)
	require.ErrorContains(t, fanout.ConsumeAll(t.Context(), broken), "fatal parser error")
	require.Zero(t, broken.Summary())
}

// Opt-in reference lookup is local-only and transaction-read-only, even if the
// configured role could write. No fixture imports, migrations or publications.
func TestNextSourceSavedReferenceParity(t *testing.T) {
	t.Parallel()
	dsn, caseDir := os.Getenv("CHRONICLE_PARSER_PARITY_DB"), os.Getenv("CHRONICLE_PARSER_PARITY_CASE")
	if dsn == "" || caseDir == "" {
		t.Skip("set explicit local parity DB and case directory")
	}
	config, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(config.ConnConfig.Database, "parser_baseline_"))
	hosts := []string{config.ConnConfig.Host}
	for _, fallback := range config.ConnConfig.Fallbacks {
		hosts = append(hosts, fallback.Host)
	}
	for _, host := range hosts {
		ip := net.ParseIP(host)
		require.True(t, host == "localhost" || (ip != nil && ip.IsLoopback()), "local-only validation DB")
	}
	config.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	pool, err := pgxpool.NewWithConfig(t.Context(), config)
	require.NoError(t, err)
	defer pool.Close()
	raw, err := os.ReadFile(filepath.Join(caseDir, "args.json"))
	require.NoError(t, err)
	var args struct {
		RealmID uuid.UUID `json:"realm_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &args))
	require.NotEqual(t, uuid.Nil, args.RealmID)
	store := database.New(pool)
	resolved, err := store.ResolveDatasetWithFlavorByRealm(t.Context(), args.RealmID)
	require.NoError(t, err)
	db, err := gamedb.New(t.Context(), gamedb.Options{DB: store, Pool: pool, DatasetID: resolved.DatasetID, Talents: talents.NewFetcher(store, nil, 1000)})
	require.NoError(t, err)
	defer func() { require.NoError(t, db.Close()) }()
	trees, err := db.TalentTrees(t.Context(), resolved.DatasetID)
	require.NoError(t, err)
	flavor := database.FlavorFromStrings(append(resolved.DefaultFlavor, resolved.AdditionalFlavor...))
	ctx := parsectx.With(t.Context(), parsectx.Context{DatasetID: resolved.DatasetID, TalentTrees: trees, Format: database.LogFormat112aCcAddon, Flavor: flavor})
	lookup := sourceOverrideDB{GameDB: db, flavor: flavor}
	path := os.Getenv("CHRONICLE_PARSER_PARITY_GZIP")
	require.NotEmpty(t, path)
	open := func() io.Reader {
		file, err := os.Open(path)
		require.NoError(t, err)
		t.Cleanup(func() { require.NoError(t, file.Close()) })
		reader, err := gzip.NewReader(file)
		require.NoError(t, err)
		t.Cleanup(func() { require.NoError(t, reader.Close()) })
		return reader
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	old, err := New(ctx, logger, open(), lookup, db)
	require.NoError(t, err)
	pipeline, err := nextsource.New(ctx, logger, lookup, db, version.GitTag)
	require.NoError(t, err)
	source, err := pipeline.OpenFile(open(), 4<<20)
	require.NoError(t, err)
	counts := map[string]int{}
	records := 0
	for {
		want, wantErr := old.Advance(ctx)
		got, gotErr := source.Advance(ctx)
		if errors.Is(wantErr, io.EOF) {
			require.ErrorIs(t, gotErr, io.EOF)
			break
		}
		if wantErr != nil {
			require.EqualError(t, gotErr, wantErr.Error())
		} else {
			require.NoError(t, gotErr)
			require.Equal(t, want, got, "record %d", records)
		}
		for _, m := range got {
			counts[fmt.Sprintf("%T", m)]++
		}
		records++
	}
	require.EqualValues(t, records, source.Summary().Lines)
	require.Equal(t, len(old.MissedSpells()), len(pipeline.MissedSpells()))
	for id, entry := range old.MissedSpells() {
		require.Equal(t, entry.Count, pipeline.MissedSpells()[id].Count)
	}
	// Reuse the exact same pipeline at an empty file boundary, not finalization.
	empty, err := pipeline.OpenFile(strings.NewReader(""), 4096)
	require.NoError(t, err)
	_, err = empty.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)
	t.Logf("records=%d output histogram=%v missed spell IDs=%d", records, counts, len(pipeline.MissedSpells()))
}

type sourceOverrideDB struct {
	gamedb.GameDB
	flavor database.WoWFlavor
}

func (d sourceOverrideDB) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	spell, err := d.GameDB.Spell(ctx, id)
	if err != nil {
		return nil, err
	}
	clone := *spell
	gamedataoverrides.ApplySpell(d.flavor, &clone)
	return &clone, nil
}

// Compile-time compatibility assertions: no production selection is changed.
var _ consumers.Advancer = (*nextsource.Source)(nil)
