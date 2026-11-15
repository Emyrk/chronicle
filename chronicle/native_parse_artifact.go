package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	azencounters "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
)

type NativeParseReport struct {
	LoadFileDuration time.Duration
	ParseDuration    time.Duration
	TotalLines       int64
	ConsumerTimes    map[string]time.Duration
	MissedSpells     map[int32]chroniclesdk.MissedSpell
}

// NativeCheckpointEnvelope is immutable publication input, never a continuation
// claim for arbitrary storage chunks. Snapshot is a COMPLETE pre-Finalize graph.
type NativeCheckpointEnvelope struct {
	Boundary        string
	Version         int
	Args            ArgsLogParse
	RealmID         uuid.UUID
	RealmName       string
	Identity        snapshot.Compatibility
	Snapshot        json.RawMessage
	SpellIDs        []chrondbc.SpellID
	LogCapabilities []string
	Report          NativeParseReport
}

func DecodeNativeCheckpoint(data []byte) (NativeCheckpointEnvelope, error) {
	var env NativeCheckpointEnvelope
	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return env, err
	}
	defer func() { _ = gz.Close() }()
	raw, err := io.ReadAll(io.LimitReader(gz, maxCheckpointBytes+1))
	if err != nil {
		return env, err
	}
	if len(raw) > maxCheckpointBytes {
		return env, fmt.Errorf("native checkpoint too large")
	}
	if err = strictCheckpointJSON(raw, &env); err != nil {
		return env, err
	}
	if env.Version != 1 || env.Boundary != "COMPLETE/preFinalize" {
		return env, fmt.Errorf("unsupported native checkpoint version")
	}
	return env, env.Identity.Validate()
}
func restoreNativeCheckpoint(ctx context.Context, env NativeCheckpointEnvelope, db gamedb.GameDB, reg *registry.Registry) (*parseResult, error) {
	if env.Boundary != "COMPLETE/preFinalize" {
		return nil, fmt.Errorf("native checkpoint is not COMPLETE/preFinalize")
	}
	actual, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("restore requires authoritative identity")
	}
	if err := env.Identity.Check(actual); err != nil {
		return nil, err
	}
	var saved checkpointEnvelope
	if err := strictCheckpointJSON(env.Snapshot, &saved); err != nil {
		return nil, err
	}
	if err := env.Identity.Check(saved.Compatibility.Source.RuntimeIdentity()); err != nil {
		return nil, err
	}
	flavor, _ := parsectx.Flavor(ctx)
	effective := overrideGameDB{GameDB: db, spells: db, flavor: flavor}
	spells := make(map[chrondbc.SpellID]*chrondbc.Spell)
	for _, id := range env.SpellIDs {
		spell, err := effective.Spell(ctx, id)
		if chrondbc.IsSpellNotFound(err) {
			unknown := chrondbc.UnknownSpell(id)
			spell = &unknown
			err = nil
		}
		if err != nil {
			return nil, err
		}
		spells[id] = spell
	}
	modifiers, err := db.DurationModifiers(ctx)
	if err != nil {
		return nil, err
	}
	catalog := &chrondbc.ConsumableCatalog{}
	if fetcher, ok := db.(interface {
		Consumables(context.Context) (*chrondbc.ConsumableCatalog, error)
	}); ok {
		catalog, err = fetcher.Consumables(ctx)
		if err != nil {
			return nil, err
		}
	}
	var prepared *registry.PreparedGraph
	if saved.Compatibility.Source.Format == database.LogFormatAzerothcoreMod {
		prepared, err = azencounters.PrepareGraph(reg, modifiers, catalog, effective)
	} else {
		prepared, err = reg.PrepareGraph(saved.Compatibility.Source.Format, modifiers, catalog, effective)
	}
	if err != nil {
		return nil, err
	}
	session, err := RestoreCompleteFileSession(bytes.NewReader(env.Snapshot), CompleteSessionOptions{Compatibility: saved.Compatibility, Logger: slog.Default(), GameDB: effective, Gear: db, Registry: reg, Prepared: prepared, PreparedSpells: spells})
	if err != nil {
		return nil, err
	}
	if err = session.WireRuntime(ctx); err != nil {
		return nil, err
	}
	result := session.root.result
	if env.Args.Verbose {
		// The downloadable debug attachment is the already-verified snapshot,
		// not a second capture of a graph that publication is about to finalize.
		result.snapshot = func(dst io.Writer) error {
			_, err := dst.Write(env.Snapshot)
			return err
		}
	}
	result.logCapabilities = env.LogCapabilities
	r := env.Report
	result.report = parseTimingReport{loadFileDuration: r.LoadFileDuration, parseDuration: r.ParseDuration, totalLines: r.TotalLines, consumerTimes: r.ConsumerTimes, missedSpells: r.MissedSpells}
	return result, nil
}
func loadNativeFinalization(ctx context.Context, st storage.ObjectStorage, attempt database.ParserCheckpointAttempt, args ArgsLogParse) (*nativeFinalization, error) {
	data, err := st.DownloadFile(ctx, BucketRaidLogs, attempt.ObjectKey)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != attempt.ObjectDigest {
		return nil, fmt.Errorf("native artifact digest mismatch")
	}
	env, err := DecodeNativeCheckpoint(data)
	if err != nil {
		return nil, err
	}
	if env.Args.LogID != attempt.LogGroupID || env.Args.ParseGeneration != attempt.Generation || env.Args.LogID != args.LogID || effectiveParseGeneration(args.ParseGeneration) != attempt.Generation || env.Args.ParserEngine != chroniclesdk.ParserEngineNext || env.Identity.BuildIdentity != attempt.ProducingBinary {
		return nil, fmt.Errorf("native artifact attempt mismatch")
	}
	var expected snapshot.Compatibility
	if err := json.Unmarshal(attempt.DatasetIdentity, &expected); err != nil {
		return nil, err
	}
	if err := expected.Check(env.Identity); err != nil {
		return nil, err
	}
	return &nativeFinalization{args: env.Args, realmID: env.RealmID, realmName: env.RealmName, restore: func(ctx context.Context, db gamedb.GameDB, reg *registry.Registry, fence *parseIdentityFence) (*parseResult, error) {
		if fence == nil {
			return nil, fmt.Errorf("native finalization requires identity fence")
		}
		if err := env.Identity.Check(fence.identity); err != nil {
			return nil, err
		}
		return restoreNativeCheckpoint(ctx, env, db, reg)
	}}, nil
}

type nativeSpellRecorder struct {
	gamedb.GameDB
	ids map[chrondbc.SpellID]bool
}

func (d *nativeSpellRecorder) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	d.ids[id] = true
	return d.GameDB.Spell(ctx, id)
}
func (d *nativeSpellRecorder) SpellsByName(ctx context.Context, name string) ([]*chrondbc.Spell, error) {
	spells, err := d.GameDB.SpellsByName(ctx, name)
	for _, s := range spells {
		if s != nil {
			d.ids[s.ID] = true
		}
	}
	return spells, err
}
func (d *nativeSpellRecorder) Consumables(ctx context.Context) (*chrondbc.ConsumableCatalog, error) {
	if f, ok := d.GameDB.(interface {
		Consumables(context.Context) (*chrondbc.ConsumableCatalog, error)
	}); ok {
		return f.Consumables(ctx)
	}
	return &chrondbc.ConsumableCatalog{}, nil
}
