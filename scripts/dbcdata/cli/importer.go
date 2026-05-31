package cli

import (
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
)

// DBCFile is a file extractable from a WoW client's DBFilesClient directory.
type DBCFile string

const (
	FileSpell                DBCFile = "Spell.dbc"
	FileSpellIcon            DBCFile = "SpellIcon.dbc"
	FileTalent               DBCFile = "Talent.dbc"
	FileTalentTab            DBCFile = "TalentTab.dbc"
	FileItemDisplayInfo      DBCFile = "ItemDisplayInfo.dbc"
	FileSpellItemEnchantment DBCFile = "SpellItemEnchantment.dbc"
	FileItemRandomProperties DBCFile = "ItemRandomProperties.dbc"
	FileItemSet              DBCFile = "ItemSet.dbc"
)

// UploadKind describes how an artifact is sent to the Chronicle API.
type UploadKind string

const (
	// UploadDBC POSTs raw DBC bytes to /game-data/dbc/upload?dbc_type=<DBCType>.
	UploadDBC UploadKind = "dbc"
	// UploadTalentTrees PUTs computed talent-tree JSON for a dataset.
	UploadTalentTrees UploadKind = "talent-trees"
)

// Artifact is a produced output ready to export to disk or upload via HTTP.
type Artifact struct {
	// Filename is used when exporting to disk (e.g. "ItemSet.dbc",
	// "talent-trees.json").
	Filename string
	// Data is the raw bytes (DBC file contents or computed JSON).
	Data []byte
	// UploadKind selects the API transport when uploading.
	UploadKind UploadKind
	// DBCType is the dbc_type query parameter for UploadDBC artifacts
	// (e.g. "ItemSet", "ItemDisplayInfo").
	DBCType string
}

// Importer produces one category of game data from a WoW client.
// Each importer declares the DBC files it needs so the extractor can read
// each file exactly once across all selected importers.
type Importer interface {
	// Key is the stable CLI selector value (e.g. "talents", "item-sets").
	Key() string
	// Name is a human-readable label for display in the selector.
	Name() string
	// RequiredFiles lists the DBC files this importer reads.
	RequiredFiles() []DBCFile
	// Produce builds the artifacts from extracted file bytes.
	// wc is provided for importers that need typed DBC parsing helpers.
	Produce(wc *dbcdb.WoWClient, files map[DBCFile][]byte) ([]Artifact, error)
}

// Registry returns all known importers in display order.
func Registry() []Importer {
	return []Importer{
		&talentImporter{},
		&rawDBCImporter{key: "item-display-info", name: "Item Display Info", file: FileItemDisplayInfo, dbcType: "ItemDisplayInfo"},
		&rawDBCImporter{key: "spell-enchantments", name: "Spell Item Enchantments", file: FileSpellItemEnchantment, dbcType: "SpellItemEnchantment"},
		&rawDBCImporter{key: "item-random-properties", name: "Item Random Properties", file: FileItemRandomProperties, dbcType: "ItemRandomProperties"},
		&rawDBCImporter{key: "item-sets", name: "Item Sets", file: FileItemSet, dbcType: "ItemSet"},
	}
}

// ImporterByKey returns the importer with the given key, or false.
func ImporterByKey(key string) (Importer, bool) {
	for _, imp := range Registry() {
		if imp.Key() == key {
			return imp, true
		}
	}
	return nil, false
}

// extractFiles reads each requested DBC file from the client exactly once.
// Files already present in the map are not re-read, so callers can share a
// single map across many importers.
func extractFiles(wc *dbcdb.WoWClient, into map[DBCFile][]byte, needed []DBCFile) error {
	for _, f := range needed {
		if _, ok := into[f]; ok {
			continue
		}
		data, err := wc.ReadFile("DBFilesClient\\" + string(f))
		if err != nil {
			return fmt.Errorf("extract %s: %w", f, err)
		}
		into[f] = data
	}
	return nil
}

// ─── Raw DBC importer ────────────────────────────────────────────
// Passes a single DBC file through unchanged. The server parses it.

type rawDBCImporter struct {
	key     string
	name    string
	file    DBCFile
	dbcType string
}

func (r *rawDBCImporter) Key() string             { return r.key }
func (r *rawDBCImporter) Name() string            { return r.name }
func (r *rawDBCImporter) RequiredFiles() []DBCFile { return []DBCFile{r.file} }

func (r *rawDBCImporter) Produce(_ *dbcdb.WoWClient, files map[DBCFile][]byte) ([]Artifact, error) {
	data, ok := files[r.file]
	if !ok {
		return nil, fmt.Errorf("missing required file %s", r.file)
	}
	return []Artifact{{
		Filename:   string(r.file),
		Data:       data,
		UploadKind: UploadDBC,
		DBCType:    r.dbcType,
	}}, nil
}

// ─── Talent importer ─────────────────────────────────────────────
// Computes the talent-tree JSON locally from 4 DBC files because the
// transformation (icon resolution, prereq graph, tab sorting) is complex
// and would otherwise require the server to stage multiple raw files.

type talentImporter struct{}

func (t *talentImporter) Key() string  { return "talents" }
func (t *talentImporter) Name() string { return "Talent Trees" }
func (t *talentImporter) RequiredFiles() []DBCFile {
	return []DBCFile{FileTalent, FileTalentTab, FileSpellIcon, FileSpell}
}

func (t *talentImporter) Produce(wc *dbcdb.WoWClient, _ map[DBCFile][]byte) ([]Artifact, error) {
	data, err := collectTalentTrees(wc)
	if err != nil {
		return nil, fmt.Errorf("collect talent trees: %w", err)
	}
	exported := convertToExportedTypes(data)
	jsonData, err := json.Marshal(exported)
	if err != nil {
		return nil, fmt.Errorf("marshal talent trees: %w", err)
	}
	return []Artifact{{
		Filename:   "talent-trees.json",
		Data:       jsonData,
		UploadKind: UploadTalentTrees,
	}}, nil
}
