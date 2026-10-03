package wowdata

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseDBCacheRejectsHeaderAndRegionMismatch(t *testing.T) {
	t.Parallel()

	badMagic := makeDBCache(t, 69913, hotfixCacheRecord{Region: 70, Status: 1})
	binary.LittleEndian.PutUint32(badMagic[:4], 0)
	_, _, _, _, _, err := parseDBCache(badMagic)
	require.ErrorContains(t, err, "magic")

	badVersion := makeDBCache(t, 69913, hotfixCacheRecord{Region: 70, Status: 1})
	binary.LittleEndian.PutUint32(badVersion[4:8], 8)
	_, _, _, _, _, err = parseDBCache(badVersion)
	require.ErrorContains(t, err, "version 8")

	mixed := makeDBCache(t, 69913,
		hotfixCacheRecord{Region: 70, Status: 1},
		hotfixCacheRecord{Region: 71, Status: 1},
	)
	_, _, _, _, _, err = parseDBCache(mixed)
	require.ErrorContains(t, err, "mixed numeric regions")
}

func TestApplyHotfixesOrderingStatusesAndProvenance(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "tables"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "dbd"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "enUS"), 0o755))
	writeTestManifest(t, dir, "SpellName")
	require.NoError(t, os.WriteFile(filepath.Join(dir, "tables", "SpellName.jsonl"), []byte(
		"{\"ID\":1,\"Name_lang\":\"base-one\"}\n{\"ID\":2,\"Name_lang\":\"base-two\"}\n"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "dbd", "SpellName.dbd"), []byte(`COLUMNS
int ID
string Name_lang

BUILD 1.60.1.69913
$noninline,id$ID<32>
Name_lang
`), 0o644))

	cache := makeDBCache(t, 69913,
		// Deliberately out of file order. PushID, UniqueID, then file order wins.
		hotfixCacheRecord{Region: 70, PushID: 20, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 1, Status: 1, Payload: cString("final-one")},
		hotfixCacheRecord{Region: 70, PushID: 10, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 1, Status: 1, Payload: cString("early-one")},
		hotfixCacheRecord{Region: 70, PushID: 20, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 3, Status: 1, Payload: cString("created-three")},
		hotfixCacheRecord{Region: 70, PushID: 20, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 2, Status: 2},
		hotfixCacheRecord{Region: 70, PushID: 20, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 4, Status: 1, Payload: cString("effective-four")},
		hotfixCacheRecord{Region: 70, PushID: 30, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 4, Status: 3, Payload: cString("ignored-three")},
		hotfixCacheRecord{Region: 70, PushID: 40, UniqueID: 1, TableHash: wowdataTableHashes["SpellName"], RecordID: 1, Status: 4, Payload: cString("ignored-four")},
	)
	cachePath := filepath.Join(dir, "enUS", "DBCache.bin")
	require.NoError(t, os.WriteFile(cachePath, cache, 0o644))

	err := ApplyHotfixes(HotfixOptions{
		SnapshotDir: dir, CachePath: cachePath, DBDDir: filepath.Join(dir, "dbd"),
		Product: "wow_classic_beta", Build: "1.60.1.69913", Region: "us", Locale: "enUS",
	})
	require.NoError(t, err)

	rows, err := readJSONObjectRows(filepath.Join(dir, "tables", "SpellName.jsonl"))
	require.NoError(t, err)
	require.Equal(t, "final-one", rows[1]["Name_lang"])
	require.NotContains(t, rows, uint32(2))
	require.Equal(t, "created-three", rows[3]["Name_lang"])
	require.Equal(t, "effective-four", rows[4]["Name_lang"])
	require.Len(t, rows, 3)

	manifest, err := readManifest(dir)
	require.NoError(t, err)
	require.True(t, manifest.Hotfix.Applied)
	require.Equal(t, uint32(70), manifest.Hotfix.NumericRegion)
	require.Equal(t, map[string]int{"1": 4, "2": 1, "3": 1, "4": 1}, manifest.Hotfix.StatusCounts)
	require.Equal(t, 4, manifest.Hotfix.AffectedTables[0].Upserts)
	require.Equal(t, 1, manifest.Hotfix.AffectedTables[0].Deletes)
	require.Equal(t, 2, manifest.Hotfix.AffectedTables[0].Ignored)
	require.NoError(t, validateHotfixProvenance(dir, manifest))

	receiptPath := filepath.Join(dir, filepath.FromSlash(manifest.Hotfix.Receipt))
	require.NoError(t, os.WriteFile(receiptPath, []byte("tampered\n"), 0o644))
	require.ErrorContains(t, validateHotfixProvenance(dir, manifest), "SHA256")
}

func TestDecodeHotfixRowIncludesNoninlineRelation(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	dbdPath := filepath.Join(dir, "SpellAuraOptions.dbd")
	require.NoError(t, os.WriteFile(dbdPath, []byte(`COLUMNS
int ID
int DifficultyID
int CumulativeAura
int ProcCategoryRecovery
int ProcChance
int ProcCharges
int SpellProcsPerMinuteID
int ProcTypeMask
int SpellID

BUILD 1.60.1.70170
$noninline,id$ID<32>
DifficultyID<16>
CumulativeAura<u16>
ProcCategoryRecovery<32>
ProcChance<u8>
ProcCharges<32>
SpellProcsPerMinuteID<u16>
ProcTypeMask<32>[2]
$noninline,relation$SpellID<32>
`), 0o644))

	fields, err := parseDBD(dbdPath, "1.60.1.70170")
	require.NoError(t, err)
	require.Len(t, fields, 9)
	require.True(t, fields[0].ID)
	require.False(t, fields[0].Inline)
	require.True(t, fields[8].Relation)
	require.False(t, fields[8].Inline)

	// SpellAuraOptions record 127917 from the 1.60.1.70170 DBCache. The
	// inline fields consume 23 bytes and the trailing relation consumes 4.
	payload := []byte{
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa8,
		0x22, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x67,
		0x40, 0x00, 0x00,
	}
	row, err := decodeHotfixRow(payload, fields, 127917)
	require.NoError(t, err)
	require.Equal(t, uint32(127917), row["ID"])
	require.Equal(t, int64(16487), row["SpellID"])

	_, err = decodeHotfixRow(payload[:26], fields, 127917)
	require.ErrorContains(t, err, "SpellID: truncated 32-bit integer")

	_, err = decodeHotfixRow(append(payload, 0), fields, 127917)
	require.ErrorContains(t, err, "schema consumed 27 of 28 payload bytes")
}

func TestApplyHotfixesRejectsBuildMismatch(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "tables"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "dbd"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "enUS"), 0o755))
	writeTestManifest(t, dir, "SpellName")
	require.NoError(t, os.WriteFile(filepath.Join(dir, "tables", "SpellName.jsonl"), nil, 0o644))
	cachePath := filepath.Join(dir, "enUS", "DBCache.bin")
	require.NoError(t, os.WriteFile(cachePath, makeDBCache(t, 69912,
		hotfixCacheRecord{Region: 70, TableHash: wowdataTableHashes["SpellName"], Status: 3}), 0o644))

	err := ApplyHotfixes(HotfixOptions{
		SnapshotDir: dir, CachePath: cachePath, DBDDir: filepath.Join(dir, "dbd"),
		Product: "wow_classic_beta", Build: "1.60.1.69913", Region: "us", Locale: "enUS",
	})
	require.ErrorContains(t, err, "does not match requested build")
}

func writeTestManifest(t *testing.T, dir, table string) {
	t.Helper()
	manifest := Manifest{
		Format: SnapshotFormat,
		Target: Target{Region: "us", Product: "wow_classic_beta", BuildName: "1.60.1.69913", Locale: "enUS"},
		Tables: []ManifestTable{{Name: table, Rows: "tables/" + table + ".jsonl", ExtractedRows: 2}},
	}
	data, err := json.Marshal(manifest)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "manifest.json"), data, 0o644))
}

func makeDBCache(t *testing.T, build int32, records ...hotfixCacheRecord) []byte {
	t.Helper()
	var output bytes.Buffer
	header := make([]byte, dbCacheHeaderSize)
	binary.LittleEndian.PutUint32(header[0:4], dbCacheMagic)
	binary.LittleEndian.PutUint32(header[4:8], 9)
	binary.LittleEndian.PutUint32(header[8:12], uint32(build))
	_, err := output.Write(header)
	require.NoError(t, err)
	for _, record := range records {
		header = make([]byte, dbCacheRecordSize)
		binary.LittleEndian.PutUint32(header[0:4], dbCacheMagic)
		binary.LittleEndian.PutUint32(header[4:8], record.Region)
		binary.LittleEndian.PutUint32(header[8:12], uint32(record.PushID))
		binary.LittleEndian.PutUint32(header[12:16], record.UniqueID)
		binary.LittleEndian.PutUint32(header[16:20], record.TableHash)
		binary.LittleEndian.PutUint32(header[20:24], record.RecordID)
		binary.LittleEndian.PutUint32(header[24:28], uint32(len(record.Payload)))
		header[28] = record.Status
		_, err = output.Write(header)
		require.NoError(t, err)
		_, err = output.Write(record.Payload)
		require.NoError(t, err)
	}
	return output.Bytes()
}

func cString(value string) []byte { return append([]byte(value), 0) }
