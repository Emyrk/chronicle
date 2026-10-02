package wowdata

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const (
	dbCacheMagic      = uint32(0x48544658)
	dbCacheHeaderSize = 44
	dbCacheRecordSize = 32
)

// Table hashes come from the wowdev/WDC table manifest cached with the pinned
// wowdata revision. Keeping the mapping here makes snapshot overlays
// deterministic and avoids one wowdata subprocess per hotfix record.
var wowdataTableHashes = map[string]uint32{
	"Item": 1344507586, "ItemDisplayInfo": 2557447376, "ItemEffect": 1073915313,
	"ItemRandomProperties": 79508367, "ItemSet": 2389973656, "ItemSparse": 2442913102,
	"Spell": 3776013982, "SpellIcon": 14913004,
	"SpellAuraOptions": 4096770149, "SpellAuraRestrictions": 3130494798,
	"SpellCastingRequirements": 1627543382, "SpellCastTimes": 4256848486,
	"SpellCategories": 3689412649, "SpellCategory": 3502494094,
	"SpellClassOptions": 680438657, "SpellCooldowns": 4193483863,
	"SpellDescriptionVariables": 1019780096, "SpellDuration": 3022256762,
	"SpellEffect": 4030871717, "SpellEquippedItems": 3830102996,
	"SpellFocusObject": 3114120978, "SpellInterrupts": 1720692227,
	"SpellItemEnchantment": 3764045193, "SpellLevels": 501138918,
	"SpellMisc": 3322146344, "SpellName": 1187407512, "SpellPower": 2712461791,
	"SpellRadius": 2877179969, "SpellRange": 3763447452, "SpellReagents": 2875640223,
	"SpellShapeshift": 3163679255, "SpellTargetRestrictions": 3764692828,
	"SpellTotems": 2769259057, "SpellXDescriptionVariables": 4091125549,
	"SkillLine": 3040725462, "SkillLineXTraitTree": 2800111168,
	"TraitDefinition": 2995956864, "TraitEdge": 2496704385, "TraitNode": 3779276131,
	"TraitNodeEntry": 2196297174, "TraitNodeGroup": 1612421313,
	"TraitNodeGroupDisplayInfo": 884257668, "TraitNodeGroupXTraitNode": 447132635,
	"TraitNodeXTraitNodeEntry": 2755108430, "TraitTree": 2521502169,
}

type HotfixOptions struct {
	SnapshotDir string
	CachePath   string
	DBDDir      string
	Product     string
	Build       string
	Region      string
	Locale      string
}

type hotfixCacheRecord struct {
	Region, UniqueID, TableHash, RecordID uint32
	PushID                                int32
	Status                                uint8
	Payload                               []byte
	Order                                 int
}

type hotfixReceipt struct {
	Format         string                `json:"format"`
	Product        string                `json:"product"`
	Build          string                `json:"build"`
	Region         string                `json:"region"`
	NumericRegion  uint32                `json:"numericRegion"`
	Locale         string                `json:"locale"`
	CacheSHA256    string                `json:"cacheSha256"`
	CacheVersion   uint32                `json:"cacheVersion"`
	CacheBuild     int32                 `json:"cacheBuild"`
	CacheSize      int64                 `json:"cacheSize"`
	RecordCount    int                   `json:"recordCount"`
	StatusCounts   map[string]int        `json:"statusCounts"`
	AffectedTables []HotfixAffectedTable `json:"affectedTables"`
}

func validateHotfixProvenance(dir string, manifest Manifest) error {
	if manifest.Hotfix == nil || !manifest.Hotfix.Applied {
		return nil // v1 snapshots created before hotfix support remain readable.
	}
	hotfix := manifest.Hotfix
	if hotfix.CacheVersion == 0 || hotfix.CacheBuild == 0 || hotfix.CacheSize <= 0 ||
		hotfix.NumericRegion == 0 || hotfix.Region == "" || hotfix.Locale == "" ||
		hotfix.CacheSHA256 == "" || hotfix.Receipt == "" || hotfix.ReceiptSHA256 == "" {
		return fmt.Errorf("applied hotfix manifest has incomplete provenance")
	}
	if hotfix.Region != manifest.Target.Region || hotfix.Locale != manifest.Target.Locale {
		return fmt.Errorf("hotfix provenance %s/%s does not match snapshot %s/%s", hotfix.Region, hotfix.Locale, manifest.Target.Region, manifest.Target.Locale)
	}
	build, err := buildRevision(manifest.Target.BuildName)
	if err != nil {
		return err
	}
	if hotfix.CacheBuild != build {
		return fmt.Errorf("hotfix cache build %d does not match snapshot build %s", hotfix.CacheBuild, manifest.Target.BuildName)
	}
	receiptRelative := filepath.Clean(filepath.FromSlash(hotfix.Receipt))
	if filepath.IsAbs(receiptRelative) || receiptRelative == ".." || strings.HasPrefix(receiptRelative, ".."+string(filepath.Separator)) {
		return fmt.Errorf("applied hotfix receipt path is invalid")
	}
	if !validSHA256(hotfix.CacheSHA256) || !validSHA256(hotfix.ReceiptSHA256) {
		return fmt.Errorf("applied hotfix manifest has invalid SHA256 provenance")
	}
	receiptPath := filepath.Join(dir, filepath.FromSlash(hotfix.Receipt))
	receiptData, err := os.ReadFile(receiptPath)
	if err != nil {
		return fmt.Errorf("read applied hotfix receipt: %w", err)
	}
	sum := sha256.Sum256(receiptData)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), hotfix.ReceiptSHA256) {
		return fmt.Errorf("applied hotfix receipt SHA256 does not match manifest")
	}
	var receipt hotfixReceipt
	if err := json.Unmarshal(receiptData, &receipt); err != nil {
		return fmt.Errorf("decode applied hotfix receipt: %w", err)
	}
	if receipt.Format != "chronicle-wowdata-hotfix-receipt-v1" || receipt.Product != manifest.Target.Product ||
		receipt.Build != manifest.Target.BuildName || receipt.Region != hotfix.Region || receipt.NumericRegion != hotfix.NumericRegion ||
		receipt.Locale != hotfix.Locale || receipt.CacheSHA256 != hotfix.CacheSHA256 || receipt.CacheVersion != hotfix.CacheVersion ||
		receipt.CacheBuild != hotfix.CacheBuild || receipt.CacheSize != hotfix.CacheSize {
		return fmt.Errorf("applied hotfix receipt provenance does not match manifest")
	}
	return nil
}

func ApplyHotfixes(opts HotfixOptions) error {
	manifest, err := readManifest(opts.SnapshotDir)
	if err != nil {
		return err
	}
	if manifest.Target.Product != opts.Product || manifest.Target.BuildName != opts.Build ||
		manifest.Target.Region != opts.Region || manifest.Target.Locale != opts.Locale {
		return fmt.Errorf("hotfix provenance does not match snapshot target: got %s/%s/%s/%s, want %s/%s/%s/%s",
			opts.Product, opts.Build, opts.Region, opts.Locale, manifest.Target.Product, manifest.Target.BuildName, manifest.Target.Region, manifest.Target.Locale)
	}
	if filepath.Base(filepath.Dir(opts.CachePath)) != opts.Locale {
		return fmt.Errorf("DBCache locale directory %q does not match requested locale %q", filepath.Base(filepath.Dir(opts.CachePath)), opts.Locale)
	}

	cacheBytes, err := os.ReadFile(opts.CachePath)
	if err != nil {
		return fmt.Errorf("read DBCache: %w", err)
	}
	version, cacheBuild, records, numericRegion, statusCounts, err := parseDBCache(cacheBytes)
	if err != nil {
		return err
	}
	buildNumber, err := buildRevision(opts.Build)
	if err != nil {
		return err
	}
	if cacheBuild != buildNumber {
		return fmt.Errorf("DBCache build %d does not match requested build %s", cacheBuild, opts.Build)
	}

	byHash := make(map[uint32]string, len(wowdataTableHashes))
	for name, hash := range wowdataTableHashes {
		byHash[hash] = name
	}
	manifestTables := make(map[string]ManifestTable, len(manifest.Tables))
	for _, table := range manifest.Tables {
		manifestTables[table.Name] = table
		if _, ok := wowdataTableHashes[table.Name]; !ok {
			return fmt.Errorf("no deterministic table hash for imported table %s", table.Name)
		}
	}

	recordsByTable := make(map[string][]hotfixCacheRecord)
	for _, record := range records {
		name, known := byHash[record.TableHash]
		if !known {
			continue // The cache contains many tables outside Chronicle's imported set.
		}
		if _, imported := manifestTables[name]; !imported {
			continue
		}
		recordsByTable[name] = append(recordsByTable[name], record)
	}

	tableNames := make([]string, 0, len(recordsByTable))
	for name := range recordsByTable {
		tableNames = append(tableNames, name)
	}
	sort.Strings(tableNames)
	affected := make([]HotfixAffectedTable, 0, len(tableNames))
	for _, name := range tableNames {
		result, err := applyTableHotfixes(opts, manifestTables[name], name, recordsByTable[name])
		if err != nil {
			return err
		}
		affected = append(affected, result)
		for i := range manifest.Tables {
			if manifest.Tables[i].Name == name {
				manifest.Tables[i].ExtractedRows = result.RowsAfter
			}
		}
	}

	cacheSum := sha256.Sum256(cacheBytes)
	receipt := hotfixReceipt{
		Format: "chronicle-wowdata-hotfix-receipt-v1", Product: opts.Product, Build: opts.Build,
		Region: opts.Region, NumericRegion: numericRegion, Locale: opts.Locale,
		CacheSHA256: hex.EncodeToString(cacheSum[:]), CacheVersion: version, CacheBuild: cacheBuild,
		CacheSize: int64(len(cacheBytes)), RecordCount: len(records), StatusCounts: statusCounts,
		AffectedTables: affected,
	}
	receiptData, err := json.MarshalIndent(receipt, "", "  ")
	if err != nil {
		return fmt.Errorf("encode hotfix receipt: %w", err)
	}
	receiptData = append(receiptData, '\n')
	receiptPath := filepath.Join(opts.SnapshotDir, "hotfix", "receipt.json")
	if err := os.MkdirAll(filepath.Dir(receiptPath), 0o755); err != nil {
		return fmt.Errorf("create hotfix receipt directory: %w", err)
	}
	if err := writeFileAtomic(receiptPath, receiptData); err != nil {
		return err
	}
	receiptSum := sha256.Sum256(receiptData)
	manifest.Hotfix = &ManifestHotfix{
		Applied: true, CacheSHA256: receipt.CacheSHA256, CacheVersion: version, CacheBuild: cacheBuild,
		CacheSize: int64(len(cacheBytes)), Region: opts.Region, NumericRegion: numericRegion, Locale: opts.Locale,
		RecordCount: len(records), StatusCounts: statusCounts, AffectedTables: affected,
		Receipt: "hotfix/receipt.json", ReceiptSHA256: hex.EncodeToString(receiptSum[:]),
	}
	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	return writeFileAtomic(filepath.Join(opts.SnapshotDir, "manifest.json"), append(manifestData, '\n'))
}

func parseDBCache(data []byte) (uint32, int32, []hotfixCacheRecord, uint32, map[string]int, error) {
	if len(data) < dbCacheHeaderSize {
		return 0, 0, nil, 0, nil, fmt.Errorf("DBCache header is truncated")
	}
	if magic := binary.LittleEndian.Uint32(data[0:4]); magic != dbCacheMagic {
		return 0, 0, nil, 0, nil, fmt.Errorf("invalid DBCache magic 0x%08x", magic)
	}
	version := binary.LittleEndian.Uint32(data[4:8])
	if version != 9 {
		return 0, 0, nil, 0, nil, fmt.Errorf("unsupported DBCache version %d, want 9", version)
	}
	build := int32(binary.LittleEndian.Uint32(data[8:12]))
	var records []hotfixCacheRecord
	regions := make(map[uint32]struct{})
	statusCounts := make(map[string]int)
	for offset, order := dbCacheHeaderSize, 0; offset < len(data); order++ {
		if len(data)-offset < dbCacheRecordSize {
			return 0, 0, nil, 0, nil, fmt.Errorf("truncated DBCache record header at offset %d", offset)
		}
		header := data[offset : offset+dbCacheRecordSize]
		if magic := binary.LittleEndian.Uint32(header[0:4]); magic != dbCacheMagic {
			return 0, 0, nil, 0, nil, fmt.Errorf("invalid DBCache record magic 0x%08x at offset %d", magic, offset)
		}
		length := int(binary.LittleEndian.Uint32(header[24:28]))
		if length < 0 || len(data)-offset-dbCacheRecordSize < length {
			return 0, 0, nil, 0, nil, fmt.Errorf("invalid DBCache payload length %d at offset %d", length, offset)
		}
		record := hotfixCacheRecord{
			Region: binary.LittleEndian.Uint32(header[4:8]), PushID: int32(binary.LittleEndian.Uint32(header[8:12])),
			UniqueID: binary.LittleEndian.Uint32(header[12:16]), TableHash: binary.LittleEndian.Uint32(header[16:20]),
			RecordID: binary.LittleEndian.Uint32(header[20:24]), Status: header[28], Order: order,
			Payload: append([]byte(nil), data[offset+dbCacheRecordSize:offset+dbCacheRecordSize+length]...),
		}
		regions[record.Region] = struct{}{}
		statusCounts[strconv.Itoa(int(record.Status))]++
		records = append(records, record)
		offset += dbCacheRecordSize + length
	}
	if len(records) == 0 || len(regions) == 0 {
		return 0, 0, nil, 0, nil, fmt.Errorf("DBCache contains no records or numeric region")
	}
	if len(regions) != 1 {
		return 0, 0, nil, 0, nil, fmt.Errorf("DBCache contains mixed numeric regions")
	}
	var region uint32
	for region = range regions {
	}
	return version, build, records, region, statusCounts, nil
}

func applyTableHotfixes(opts HotfixOptions, table ManifestTable, name string, records []hotfixCacheRecord) (HotfixAffectedTable, error) {
	rows, err := readJSONObjectRows(filepath.Join(opts.SnapshotDir, filepath.FromSlash(table.Rows)))
	if err != nil {
		return HotfixAffectedTable{}, fmt.Errorf("read base table %s: %w", name, err)
	}
	before := len(rows)
	fields, err := parseDBD(filepath.Join(opts.DBDDir, name+".dbd"), opts.Build)
	if err != nil {
		return HotfixAffectedTable{}, fmt.Errorf("load DBD for affected table %s: %w", name, err)
	}
	sort.SliceStable(records, func(i, j int) bool {
		if records[i].PushID != records[j].PushID {
			return records[i].PushID < records[j].PushID
		}
		if records[i].UniqueID != records[j].UniqueID {
			return records[i].UniqueID < records[j].UniqueID
		}
		return records[i].Order < records[j].Order
	})
	result := HotfixAffectedTable{Name: name, TableHash: wowdataTableHashes[name], Records: len(records), RowsBefore: before}
	for _, record := range records {
		switch record.Status {
		case 1:
			row, err := decodeHotfixRow(record.Payload, fields, record.RecordID)
			if err != nil {
				return HotfixAffectedTable{}, fmt.Errorf("decode %s record %d push %d: %w", name, record.RecordID, record.PushID, err)
			}
			rows[record.RecordID] = row
			result.Upserts++
		case 2:
			delete(rows, record.RecordID)
			result.Deletes++
		case 3, 4:
			// Payload inspection for the Forever V9 cache established that these
			// statuses are non-effective metadata. They never supersede status 1/2.
			result.Ignored++
		default:
			return HotfixAffectedTable{}, fmt.Errorf("unsupported effective status %d for %s record %d", record.Status, name, record.RecordID)
		}
	}
	result.RowsAfter = len(rows)
	if err := writeJSONObjectRows(filepath.Join(opts.SnapshotDir, filepath.FromSlash(table.Rows)), rows); err != nil {
		return HotfixAffectedTable{}, err
	}
	return result, nil
}

type dbdField struct {
	Name     string
	Type     string
	Bits     int
	ArrayLen int
	Signed   bool
	Inline   bool
	ID       bool
}

var (
	dbdColumnRE = regexp.MustCompile(`^(int|float|locstring|string)(?:<[^>]+>)?\s+([^\s?]+)`)
	dbdBuildRE  = regexp.MustCompile(`^BUILD\s+(.+)$`)
	dbdFieldRE  = regexp.MustCompile(`^(?:\$([^$]+)\$)?([^<\[]+)(?:<(u?)(\d+)>)?(?:\[(\d+)\])?$`)
)

func parseDBD(path, build string) ([]dbdField, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	chunks := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n\n")
	columns := make(map[string]string)
	for _, chunk := range chunks {
		lines := nonemptyLines(chunk)
		if len(lines) == 0 || lines[0] != "COLUMNS" {
			continue
		}
		for _, line := range lines[1:] {
			if match := dbdColumnRE.FindStringSubmatch(line); match != nil {
				columns[match[2]] = match[1]
			}
		}
	}
	for _, chunk := range chunks {
		lines := nonemptyLines(chunk)
		if len(lines) == 0 || lines[0] == "COLUMNS" {
			continue
		}
		matchedBuild := false
		for _, line := range lines {
			if match := dbdBuildRE.FindStringSubmatch(line); match != nil && buildListContains(match[1], build) {
				matchedBuild = true
			}
		}
		if !matchedBuild {
			continue
		}
		var fields []dbdField
		for _, line := range lines {
			if strings.HasPrefix(line, "BUILD ") {
				continue
			}
			match := dbdFieldRE.FindStringSubmatch(line)
			if match == nil {
				continue
			}
			typ, ok := columns[match[2]]
			if !ok {
				return nil, fmt.Errorf("field %s has no column type", match[2])
			}
			field := dbdField{Name: match[2], Type: typ, Bits: 32, ArrayLen: 1, Signed: true, Inline: true}
			for _, annotation := range strings.Split(match[1], ",") {
				switch strings.TrimSpace(annotation) {
				case "id":
					field.ID = true
				case "noninline":
					field.Inline = false
				}
			}
			if match[3] == "u" {
				field.Signed = false
			}
			if match[4] != "" {
				field.Bits, _ = strconv.Atoi(match[4])
			}
			if match[5] != "" {
				field.ArrayLen, _ = strconv.Atoi(match[5])
			}
			fields = append(fields, field)
		}
		if len(fields) == 0 {
			return nil, fmt.Errorf("build %s has no fields", build)
		}
		return fields, nil
	}
	return nil, fmt.Errorf("no DBD definition for build %s", build)
}

func nonemptyLines(chunk string) []string {
	var out []string
	for _, line := range strings.Split(chunk, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "COMMENT ") && !strings.HasPrefix(line, "LAYOUT ") {
			out = append(out, line)
		}
	}
	return out
}

func buildListContains(value, build string) bool {
	for _, candidate := range strings.Split(value, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == build {
			return true
		}
		if parts := strings.Split(candidate, "-"); len(parts) == 2 && compareBuild(build, parts[0]) >= 0 && compareBuild(build, parts[1]) <= 0 {
			return true
		}
	}
	return false
}

func compareBuild(a, b string) int {
	ap, bp := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 4; i++ {
		var av, bv int
		if i < len(ap) {
			av, _ = strconv.Atoi(ap[i])
		}
		if i < len(bp) {
			bv, _ = strconv.Atoi(bp[i])
		}
		if av < bv {
			return -1
		}
		if av > bv {
			return 1
		}
	}
	return 0
}

func decodeHotfixRow(payload []byte, fields []dbdField, recordID uint32) (map[string]any, error) {
	row := make(map[string]any, len(fields))
	offset := 0
	for _, field := range fields {
		if !field.Inline {
			if field.ID {
				row[field.Name] = recordID
			}
			continue
		}
		values := make([]any, field.ArrayLen)
		for i := range values {
			value, used, err := decodeHotfixValue(payload[offset:], field)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", field.Name, err)
			}
			offset += used
			values[i] = value
		}
		if field.ArrayLen == 1 {
			row[field.Name] = values[0]
		} else {
			row[field.Name] = values
		}
	}
	if offset != len(payload) {
		return nil, fmt.Errorf("schema consumed %d of %d payload bytes", offset, len(payload))
	}
	if _, ok := row["ID"]; !ok {
		row["ID"] = recordID
	}
	return row, nil
}

func decodeHotfixValue(data []byte, field dbdField) (any, int, error) {
	switch field.Type {
	case "int":
		size := (field.Bits + 7) / 8
		if size < 1 || size > 8 || len(data) < size {
			return nil, 0, fmt.Errorf("truncated %d-bit integer", field.Bits)
		}
		var value uint64
		for i := 0; i < size; i++ {
			value |= uint64(data[i]) << (8 * i)
		}
		if field.Signed {
			bits := uint(size * 8)
			if bits < 64 && value&(uint64(1)<<(bits-1)) != 0 {
				value |= ^uint64(0) << bits
			}
			return int64(value), size, nil
		}
		return value, size, nil
	case "float":
		if len(data) < 4 {
			return nil, 0, fmt.Errorf("truncated float")
		}
		return float64(math.Float32frombits(binary.LittleEndian.Uint32(data[:4]))), 4, nil
	case "string", "locstring":
		end := bytes.IndexByte(data, 0)
		if end < 0 {
			return nil, 0, fmt.Errorf("unterminated string")
		}
		return string(data[:end]), end + 1, nil
	default:
		return nil, 0, fmt.Errorf("unsupported DBD type %q", field.Type)
	}
}

func readJSONObjectRows(path string) (map[uint32]map[string]any, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	rows := make(map[uint32]map[string]any)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
	for line := 1; scanner.Scan(); line++ {
		decoder := json.NewDecoder(bytes.NewReader(scanner.Bytes()))
		decoder.UseNumber()
		var row map[string]any
		if err := decoder.Decode(&row); err != nil {
			return nil, fmt.Errorf("line %d: %w", line, err)
		}
		id, err := jsonUint32(row["ID"])
		if err != nil {
			return nil, fmt.Errorf("line %d ID: %w", line, err)
		}
		if _, exists := rows[id]; exists {
			return nil, fmt.Errorf("duplicate ID %d", id)
		}
		rows[id] = row
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return rows, nil
}

func writeJSONObjectRows(path string, rows map[uint32]map[string]any) error {
	ids := make([]uint32, 0, len(rows))
	for id := range rows {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	for _, id := range ids {
		if err := encoder.Encode(rows[id]); err != nil {
			return fmt.Errorf("encode row %d: %w", id, err)
		}
	}
	return writeFileAtomic(path, output.Bytes())
}

func jsonUint32(value any) (uint32, error) {
	switch value := value.(type) {
	case json.Number:
		n, err := strconv.ParseUint(value.String(), 10, 32)
		return uint32(n), err
	case float64:
		if value < 0 || value > math.MaxUint32 || value != math.Trunc(value) {
			return 0, fmt.Errorf("invalid number %v", value)
		}
		return uint32(value), nil
	case uint32:
		return value, nil
	case uint64:
		if value > math.MaxUint32 {
			return 0, fmt.Errorf("out of range")
		}
		return uint32(value), nil
	case int64:
		if value < 0 || value > math.MaxUint32 {
			return 0, fmt.Errorf("out of range")
		}
		return uint32(value), nil
	default:
		return 0, fmt.Errorf("unsupported value %T", value)
	}
}

func validSHA256(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size
}

func buildRevision(build string) (int32, error) {
	parts := strings.Split(build, ".")
	value := parts[len(parts)-1]
	revision, err := strconv.ParseInt(value, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("invalid build %q: %w", build, err)
	}
	return int32(revision), nil
}

func writeFileAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".hotfix-*")
	if err != nil {
		return fmt.Errorf("create temporary file for %s: %w", path, err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close %s: %w", path, err)
	}
	if err := os.Chmod(tmpName, 0o644); err != nil {
		return fmt.Errorf("chmod %s: %w", path, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("replace %s: %w", path, err)
	}
	return nil
}
