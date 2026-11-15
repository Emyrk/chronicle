package chronicle

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"time"

	azencounters "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	nextvanilla "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/version"
)

// debugGameDB freezes each effective spell on first lookup. All lookup routes
// share canonical pointers; missing spells keep their original errors and record
// the exact intentional UnknownSpell fallback used by the native decoders.
// It is owned by one serial parse, never shared between workers.
type debugGameDB struct {
	gamedb.GameDB
	spells    gamedb.SpellFetcher
	prepared  map[chrondbc.SpellID]*chrondbc.Spell
	canonical map[chrondbc.SpellID]*chrondbc.Spell
	errors    map[chrondbc.SpellID]error
}

func (d *debugGameDB) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if _, ok := d.prepared[id]; ok {
		if err := d.errors[id]; err != nil {
			return nil, err
		}
		return d.canonical[id], nil
	}
	spell, err := d.spells.Spell(ctx, id)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			unknown := chrondbc.UnknownSpell(id)
			d.prepared[id] = &unknown
			d.errors[id] = err
		}
		return nil, err
	}
	if spell == nil {
		return nil, fmt.Errorf("nil effective spell %d", id)
	}
	d.prepared[id] = nextvanilla.ClonePreparedSpell(spell)
	d.canonical[id] = nextvanilla.ClonePreparedSpell(spell)
	return d.canonical[id], nil
}
func (d *debugGameDB) SpellsByName(ctx context.Context, name string) ([]*chrondbc.Spell, error) {
	found, err := d.spells.SpellsByName(ctx, name)
	if err != nil {
		return nil, err
	}
	out := make([]*chrondbc.Spell, 0, len(found))
	for _, spell := range found {
		if spell == nil {
			return nil, fmt.Errorf("nil named spell")
		}
		canonical, err := d.Spell(ctx, spell.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, canonical)
	}
	return out, nil
}
func debugInput(id string, b []byte) CompleteFile {
	sum := sha256.Sum256(b)
	return CompleteFile{ID: id, Size: int64(len(b)), SHA256: hex.EncodeToString(sum[:])}
}

// parseDebugSession uses the same logical file (including ready append parts)
// and explicit Sidekick order as ordinary parsing. It never treats append chunks
// as separate complete files. Publication remains exclusively with the worker.
func (w *parseCompute) parseDebugSession(ctx context.Context, format database.LogFormat, files []database.LogFile, artifacts []database.LogGroupArtifact, db gamedb.GameDB, reg *registry.Registry, preloaded []byte, realm string) (*parseResult, error) {
	identity, ok := snapshot.FromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("debug snapshot requires authoritative parse identity")
	}
	if len(files) != 1 {
		return nil, fmt.Errorf("debug snapshot requires one logical file")
	}
	logger := w.logger
	if !w.emitParsingLogs {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	start := time.Now()
	data := preloaded
	var err error
	if data == nil {
		data, err = w.loadFileBytes(ctx, files[0])
		if err != nil {
			return nil, err
		}
	}
	descriptor := debugInput(files[0].ID.String(), data)
	bundle := CompleteBundle{File: descriptor}
	input := FileBundle{File: descriptor, Input: bytes.NewReader(data)}
	if format == database.LogFormat335aCcAddon {
		for _, a := range artifacts {
			if a.Kind != ArtifactKindSidekickStorage {
				continue
			}
			payload, err := w.storage.DownloadFile(ctx, BucketRaidLogs, a.ObjectKey)
			if err != nil {
				return nil, fmt.Errorf("load debug Sidekick input: %w", err)
			}
			f := debugInput(a.ID.String(), payload)
			desc := CompleteArtifact{ID: f.ID, Kind: a.Kind, SchemaVersion: a.SchemaVersion, Size: f.Size, SHA256: f.SHA256}
			bundle.Artifacts = append(bundle.Artifacts, desc)
			input.Artifacts = append(input.Artifacts, BundleArtifactInput{Artifact: desc, Input: bytes.NewReader(payload)})
		}
	}
	loadDuration := time.Since(start)
	flavor, _ := parsectx.Flavor(ctx)
	effective := &debugGameDB{GameDB: db, spells: overrideGameDB{GameDB: db, spells: db, flavor: flavor}, prepared: make(map[chrondbc.SpellID]*chrondbc.Spell), canonical: make(map[chrondbc.SpellID]*chrondbc.Spell), errors: make(map[chrondbc.SpellID]error)}
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
	if format == database.LogFormatAzerothcoreMod {
		prepared, err = azencounters.PrepareGraph(reg, modifiers, catalog, effective)
	} else {
		prepared, err = reg.PrepareGraph(format, modifiers, catalog, effective)
	}
	if err != nil {
		return nil, err
	}
	opts := CompleteSessionOptions{Compatibility: SessionCompatibility{Source: nextsource.Compatibility{DatasetID: identity.DatasetID, DatasetRevision: identity.DatasetRevision, BuildIdentity: identity.BuildIdentity, Format: format, Flavor: identity.Flavor, BuildVersion: version.GitTag, CustomOverrideVersion: "executable:" + identity.BuildIdentity}, Recipe: prepared.RecipeID(), Policy: "worker-debug-v1", IdentityMode: true, Realm: realm}, Bundles: []CompleteBundle{bundle}, Logger: logger, GameDB: effective, Gear: db, Registry: reg, Prepared: prepared, PreparedSpells: effective.prepared}
	session, err := NewCompleteFileSession(ctx, opts)
	if err != nil {
		return nil, err
	}
	if err := session.ProcessFiles(ctx, []FileBundle{input}); err != nil {
		return nil, err
	}
	result := session.root.result
	result.report.loadFileDuration = loadDuration
	result.report.parseDuration = time.Since(start)
	result.report.consumerTimes = result.consumers.Times()
	result.snapshot = session.Snapshot
	return result, nil
}
