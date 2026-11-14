package chronicle

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func prefixFixture() (database.LogFile, []database.LogFilePart) {
	id := uuid.MustParse("ed871e40-8ac9-4a4a-81fe-eaeb85d51401")
	base := database.LogFile{ID: id, Owner: id, WowLogID: id, Hash: "opaque-base-hash", SizeBytes: 110, CompressedSizeBytes: pgtype.Int8{Int64: 55, Valid: true}, ContentEncoding: pgtype.Text{String: "gzip", Valid: true}, MimeType: "text/plain"}
	makePart := func(sequence, source int64, suffix byte) database.LogFilePart {
		partID := id
		partID[15] = suffix
		return database.LogFilePart{ID: partID, LogFileID: id, UploadID: partID, ReservationID: partID, Sequence: sequence, SourceSequence: pgtype.Int8{Int64: source, Valid: true}, ObjectKey: "parts/" + partID.String(), Status: "ready", Hash: pgtype.Text{String: "opaque-part-hash", Valid: true}, SizeBytes: pgtype.Int8{Int64: 10, Valid: true}, CompressedSizeBytes: pgtype.Int8{Int64: 5, Valid: true}, ContentEncoding: pgtype.Text{String: "gzip", Valid: true}, FinalizedAt: pgtype.Timestamptz{Time: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), Valid: true}}
	}
	return base, []database.LogFilePart{makePart(3, 2, 2), makePart(1, 100, 3)}
}

func prefixRoundtrip(t *testing.T, m LogparsePrefixManifest) LogparsePrefixManifest {
	t.Helper()
	data, err := json.Marshal(m)
	require.NoError(t, err)
	var got LogparsePrefixManifest
	require.NoError(t, json.Unmarshal(data, &got))
	return got
}

func TestLogparsePrefixAppendAndHiddenFinalized(t *testing.T) {
	t.Parallel()
	base, parts := prefixFixture()
	// A pending row before parts[0] makes the safe-ready result empty even
	// though its finalized bytes already contribute to the base aggregate.
	accepted, err := BuildLogparsePrefixManifest(base, nil, parts[:1])
	require.NoError(t, err)
	require.Equal(t, int64(100), accepted.Base.SizeBytes)
	require.Equal(t, int64(50), *accepted.Base.CompressedSizeBytes)
	require.Empty(t, accepted.Parts)
	fresh, err := BuildLogparsePrefixManifest(base, parts[:1], parts[:1])
	require.NoError(t, err)
	require.NoError(t, ValidateLogparsePrefix(prefixRoundtrip(t, accepted), fresh))
	base.SizeBytes += 10
	base.CompressedSizeBytes.Int64 += 5
	longer, err := BuildLogparsePrefixManifest(base, parts, parts)
	require.NoError(t, err)
	require.Equal(t, fresh.Base, longer.Base)
	require.NoError(t, ValidateLogparsePrefix(prefixRoundtrip(t, fresh), prefixRoundtrip(t, longer)))
	require.NoError(t, ValidateLogparsePrefix(longer, longer))
	require.Error(t, ValidateLogparsePrefix(longer, fresh))
	// Input mutation cannot alter a captured manifest.
	parts[0].Hash.String = "mutated"
	parts[0].SourceSequence.Int64 = 999
	require.Equal(t, "opaque-part-hash", longer.Parts[0].Hash)
	require.Equal(t, int64(2), *longer.Parts[0].SourceSequence)
}

func TestLogparsePrefixMutationsRejected(t *testing.T) {
	t.Parallel()
	base, parts := prefixFixture()
	base.SizeBytes += 10
	base.CompressedSizeBytes.Int64 += 5
	accepted, err := BuildLogparsePrefixManifest(base, parts, parts)
	require.NoError(t, err)
	for name, change := range map[string]func(*LogparsePrefixManifest){
		"version":         func(m *LogparsePrefixManifest) { m.Version++ },
		"base hash":       func(m *LogparsePrefixManifest) { m.Base.Hash = "different" },
		"base size":       func(m *LogparsePrefixManifest) { m.Base.SizeBytes++ },
		"base encoding":   func(m *LogparsePrefixManifest) { m.Base.ContentEncoding = nil },
		"base compressed": func(m *LogparsePrefixManifest) { *m.Base.CompressedSizeBytes++ },
		"key":             func(m *LogparsePrefixManifest) { m.Parts[0].ObjectKey = "other" },
		"hash":            func(m *LogparsePrefixManifest) { m.Parts[0].Hash = "other" },
		"size":            func(m *LogparsePrefixManifest) { m.Parts[0].SizeBytes++ },
		"compressed":      func(m *LogparsePrefixManifest) { *m.Parts[0].CompressedSizeBytes++ },
		"encoding":        func(m *LogparsePrefixManifest) { m.Parts[0].ContentEncoding = nil },
		"status":          func(m *LogparsePrefixManifest) { m.Parts[0].Status = "pending" },
		"sequence":        func(m *LogparsePrefixManifest) { m.Parts[0].Sequence = 9 },
		"source sequence": func(m *LogparsePrefixManifest) { *m.Parts[0].SourceSequence = 3 },
		"finalized":       func(m *LogparsePrefixManifest) { m.Parts[0].FinalizedAt = m.Parts[0].FinalizedAt.Add(time.Second) },
		"removed":         func(m *LogparsePrefixManifest) { m.Parts = m.Parts[1:] },
		"reordered":       func(m *LogparsePrefixManifest) { m.Parts[0], m.Parts[1] = m.Parts[1], m.Parts[0] },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			fresh := prefixRoundtrip(t, accepted)
			change(&fresh)
			require.Error(t, ValidateLogparsePrefix(accepted, fresh))
		})
	}
}

func TestLogparsePrefixInvalidMetadata(t *testing.T) {
	t.Parallel()
	for name, change := range map[string]func(*database.LogFile, []database.LogFilePart){
		"missing base":                func(b *database.LogFile, _ []database.LogFilePart) { b.ID = uuid.Nil },
		"base hash":                   func(b *database.LogFile, _ []database.LogFilePart) { b.Hash = "" },
		"deleted":                     func(b *database.LogFile, _ []database.LogFilePart) { b.StorageDeletedAt.Valid = true },
		"negative base":               func(b *database.LogFile, _ []database.LogFilePart) { b.SizeBytes = -1 },
		"negative derived":            func(b *database.LogFile, _ []database.LogFilePart) { b.SizeBytes = 1 },
		"negative derived compressed": func(b *database.LogFile, _ []database.LogFilePart) { b.CompressedSizeBytes.Int64 = 1 },
		"pending":                     func(_ *database.LogFile, p []database.LogFilePart) { p[0].Status = "pending" },
		"failed":                      func(_ *database.LogFile, p []database.LogFilePart) { p[0].Status = "failed" },
		"missing hash":                func(_ *database.LogFile, p []database.LogFilePart) { p[0].Hash.Valid = false },
		"missing size":                func(_ *database.LogFile, p []database.LogFilePart) { p[0].SizeBytes.Valid = false },
		"negative size":               func(_ *database.LogFile, p []database.LogFilePart) { p[0].SizeBytes.Int64 = -1 },
		"negative compressed":         func(_ *database.LogFile, p []database.LogFilePart) { p[0].CompressedSizeBytes.Int64 = -1 },
		"missing finalized":           func(_ *database.LogFile, p []database.LogFilePart) { p[0].FinalizedAt.Valid = false },
		"missing key":                 func(_ *database.LogFile, p []database.LogFilePart) { p[0].ObjectKey = "" },
		"wrong file":                  func(_ *database.LogFile, p []database.LogFilePart) { p[0].LogFileID = uuid.Nil },
		"size overflow": func(b *database.LogFile, p []database.LogFilePart) {
			b.SizeBytes = math.MaxInt64
			p[0].SizeBytes.Int64 = math.MaxInt64
		},
		"compressed overflow": func(b *database.LogFile, p []database.LogFilePart) {
			b.CompressedSizeBytes.Int64 = math.MaxInt64
			p[0].CompressedSizeBytes.Int64 = math.MaxInt64
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			base, parts := prefixFixture()
			change(&base, parts)
			_, err := BuildLogparsePrefixManifest(base, parts, parts)
			require.Error(t, err)
		})
	}
	base, parts := prefixFixture()
	_, err := BuildLogparsePrefixManifest(base, parts, nil)
	require.Error(t, err)
	_, err = BuildLogparsePrefixManifest(base, parts[:1], []database.LogFilePart{parts[0], parts[0]})
	require.Error(t, err)
	_, err = BuildLogparsePrefixManifest(base, []database.LogFilePart{parts[0], parts[0]}, parts[:1])
	require.Error(t, err)
	changed := append([]database.LogFilePart(nil), parts...)
	changed[0].Hash.String = "changed"
	_, err = BuildLogparsePrefixManifest(base, changed, parts)
	require.Error(t, err)
	_, err = BuildLogparsePrefixManifest(base, []database.LogFilePart{parts[1], parts[0]}, parts)
	require.Error(t, err)
}

func TestLogparsePrefixNullableAndSparseOrdering(t *testing.T) {
	t.Parallel()
	base, parts := prefixFixture()
	base.CompressedSizeBytes = pgtype.Int8{}
	base.ContentEncoding = pgtype.Text{}
	parts[0].CompressedSizeBytes = pgtype.Int8{}
	parts[0].ContentEncoding = pgtype.Text{}
	parts[1].SourceSequence = pgtype.Int8{}
	manifest, err := BuildLogparsePrefixManifest(base, parts, parts)
	require.NoError(t, err)
	require.Nil(t, manifest.Base.CompressedSizeBytes)
	require.Nil(t, manifest.Parts[0].CompressedSizeBytes)
	require.NoError(t, ValidateLogparsePrefix(manifest, prefixRoundtrip(t, manifest)))
	// Sparse, even negative source-sequence values are legal DB values; no
	// contiguous or positive source-sequence requirement is invented here.
	parts[0].SourceSequence.Int64 = -10
	_, err = BuildLogparsePrefixManifest(base, parts, parts)
	require.NoError(t, err)
}
