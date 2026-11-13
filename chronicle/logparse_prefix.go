package chronicle

import (
	"fmt"
	"math"
	"path"
	"reflect"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// LogparsePrefixManifest describes storage objects, NOT complete parser files.
// Resume additionally requires a parser-confirmed record boundary and source
// continuation handling: an object can end halfway through a logical record.
// Hashes are opaque authoritative row metadata, not rehashed object bytes. This
// helper trusts immutable object storage and the supplied consistent DB view.
type LogparsePrefixManifest struct {
	Version int                  `json:"version"`
	Base    LogparsePrefixBase   `json:"base"`
	Parts   []LogparsePrefixPart `json:"parts"`
}

type LogparsePrefixBase struct {
	ID                  uuid.UUID `json:"id"`
	Owner               uuid.UUID `json:"owner"`
	WowLogID            uuid.UUID `json:"wow_log_id"`
	ObjectKey           string    `json:"object_key"`
	Hash                string    `json:"hash"`
	SizeBytes           int64     `json:"size_bytes"`
	CompressedSizeBytes *int64    `json:"compressed_size_bytes"`
	ContentEncoding     *string   `json:"content_encoding"`
	MimeType            string    `json:"mime_type"`
}

type LogparsePrefixPart struct {
	ID                  uuid.UUID `json:"id"`
	LogFileID           uuid.UUID `json:"log_file_id"`
	UploadID            uuid.UUID `json:"upload_id"`
	ReservationID       uuid.UUID `json:"reservation_id"`
	Sequence            int64     `json:"sequence"`
	SourceSequence      *int64    `json:"source_sequence"`
	ObjectKey           string    `json:"object_key"`
	Status              string    `json:"status"`
	Hash                string    `json:"hash"`
	SizeBytes           int64     `json:"size_bytes"`
	CompressedSizeBytes *int64    `json:"compressed_size_bytes"`
	ContentEncoding     *string   `json:"content_encoding"`
	FinalizedAt         time.Time `json:"finalized_at"`
}

// BuildLogparsePrefixManifest accepts one authoritative consistent database view:
// base + ListReadyLogFileParts + ListFinalizedLogFileParts. Future callers must
// obtain this under a consistent transaction/locking contract, NOT three unrelated
// reads. All-finalized rows ONLY recover immutable base sizes from mutable totals;
// they never admit parser input. The ready query remains the input authority.
func BuildLogparsePrefixManifest(base database.LogFile, ready, finalized []database.LogFilePart) (LogparsePrefixManifest, error) {
	fail := func(err error) (LogparsePrefixManifest, error) { return LogparsePrefixManifest{}, err }
	if base.ID == uuid.Nil || base.Owner == uuid.Nil || base.WowLogID == uuid.Nil || strings.TrimSpace(base.Hash) == "" || base.SizeBytes < 0 || base.StorageDeletedAt.Valid {
		return fail(fmt.Errorf("missing, deleted, or invalid base metadata"))
	}
	if err := prefixEncoding(base.ContentEncoding, base.CompressedSizeBytes); err != nil {
		return fail(err)
	}
	result := LogparsePrefixManifest{Version: 1, Base: LogparsePrefixBase{ID: base.ID, Owner: base.Owner, WowLogID: base.WowLogID, ObjectKey: path.Join("logs", base.ID.String()), Hash: base.Hash, SizeBytes: base.SizeBytes, CompressedSizeBytes: prefixInt(base.CompressedSizeBytes), ContentEncoding: prefixText(base.ContentEncoding), MimeType: base.MimeType}, Parts: make([]LogparsePrefixPart, 0, len(ready))}
	all := make(map[uuid.UUID]LogparsePrefixPart, len(finalized))
	keys := map[string]bool{result.Base.ObjectKey: true}
	sequences := map[int64]bool{}
	sources := map[int64]bool{}
	var total, compressed int64
	for _, row := range finalized {
		part, err := prefixPart(row, base.ID)
		if err != nil {
			return fail(err)
		}
		if _, ok := all[part.ID]; ok {
			return fail(fmt.Errorf("duplicate finalized part ID"))
		}
		if keys[part.ObjectKey] || sequences[part.Sequence] {
			return fail(fmt.Errorf("duplicate finalized key or sequence"))
		}
		if part.SourceSequence != nil {
			if sources[*part.SourceSequence] {
				return fail(fmt.Errorf("duplicate source sequence"))
			}
			sources[*part.SourceSequence] = true
		}
		keys[part.ObjectKey] = true
		sequences[part.Sequence] = true
		all[part.ID] = part
		if part.SizeBytes > math.MaxInt64-total {
			return fail(fmt.Errorf("part size overflow"))
		}
		total += part.SizeBytes
		if base.CompressedSizeBytes.Valid {
			if part.CompressedSizeBytes == nil {
				return fail(fmt.Errorf("cannot derive compressed base size from null part size"))
			}
			if *part.CompressedSizeBytes > math.MaxInt64-compressed {
				return fail(fmt.Errorf("compressed part size overflow"))
			}
			compressed += *part.CompressedSizeBytes
		}
	}
	if total > base.SizeBytes {
		return fail(fmt.Errorf("negative derived base size"))
	}
	result.Base.SizeBytes -= total
	if result.Base.CompressedSizeBytes != nil {
		if compressed > *result.Base.CompressedSizeBytes {
			return fail(fmt.Errorf("negative derived compressed base size"))
		}
		*result.Base.CompressedSizeBytes -= compressed
	}
	seen := map[uuid.UUID]bool{}
	for _, row := range ready {
		part, err := prefixPart(row, base.ID)
		if err != nil {
			return fail(err)
		}
		expected, ok := all[part.ID]
		if !ok || !prefixEqual(part, expected) {
			return fail(fmt.Errorf("ready part missing or changed in finalized metadata"))
		}
		if seen[part.ID] {
			return fail(fmt.Errorf("duplicate ready part"))
		}
		seen[part.ID] = true
		if len(result.Parts) > 0 && !prefixLess(result.Parts[len(result.Parts)-1], part) {
			return fail(fmt.Errorf("ready parts are not in query order"))
		}
		result.Parts = append(result.Parts, part)
	}
	return result, nil
}

// ValidateLogparsePrefix accepts only an identical or appended ordered prefix.
// Both manifests must come from validated authoritative metadata. Structural
// validation also rejects malformed manifests loaded from a disk JSON roundtrip.
func ValidateLogparsePrefix(accepted, fresh LogparsePrefixManifest) error {
	if err := validatePrefixManifest(accepted); err != nil {
		return err
	}
	if err := validatePrefixManifest(fresh); err != nil {
		return err
	}
	if !prefixEqual(accepted.Base, fresh.Base) {
		return fmt.Errorf("base object metadata changed")
	}
	if len(fresh.Parts) < len(accepted.Parts) {
		return fmt.Errorf("accepted parts removed")
	}
	for i, part := range accepted.Parts {
		if !prefixEqual(part, fresh.Parts[i]) {
			return fmt.Errorf("accepted part %d changed or reordered", i)
		}
	}
	return nil
}

func validatePrefixManifest(m LogparsePrefixManifest) error {
	if m.Version != 1 {
		return fmt.Errorf("unsupported prefix manifest version")
	}
	// Reconstruct authoritative-shaped rows to reuse validation; sums represent
	// this manifest's accepted subset only, never hidden finalized storage rows.
	base := database.LogFile{ID: m.Base.ID, Owner: m.Base.Owner, WowLogID: m.Base.WowLogID, Hash: m.Base.Hash, SizeBytes: m.Base.SizeBytes, MimeType: m.Base.MimeType}
	if m.Base.ObjectKey != path.Join("logs", base.ID.String()) {
		return fmt.Errorf("invalid base object key")
	}
	if m.Base.ContentEncoding != nil {
		base.ContentEncoding = pgtype.Text{String: *m.Base.ContentEncoding, Valid: true}
	}
	if m.Base.CompressedSizeBytes != nil {
		base.CompressedSizeBytes = pgtype.Int8{Int64: *m.Base.CompressedSizeBytes, Valid: true}
	}
	rows := make([]database.LogFilePart, 0, len(m.Parts))
	for _, p := range m.Parts {
		if p.SizeBytes < 0 || p.SizeBytes > math.MaxInt64-base.SizeBytes {
			return fmt.Errorf("invalid manifest size")
		}
		base.SizeBytes += p.SizeBytes
		row := database.LogFilePart{ID: p.ID, LogFileID: p.LogFileID, UploadID: p.UploadID, ReservationID: p.ReservationID, Sequence: p.Sequence, ObjectKey: p.ObjectKey, Status: p.Status, Hash: pgtype.Text{String: p.Hash, Valid: true}, SizeBytes: pgtype.Int8{Int64: p.SizeBytes, Valid: true}, FinalizedAt: pgtype.Timestamptz{Time: p.FinalizedAt, Valid: true}}
		if p.SourceSequence != nil {
			row.SourceSequence = pgtype.Int8{Int64: *p.SourceSequence, Valid: true}
		}
		if p.ContentEncoding != nil {
			row.ContentEncoding = pgtype.Text{String: *p.ContentEncoding, Valid: true}
		}
		if p.CompressedSizeBytes != nil {
			row.CompressedSizeBytes = pgtype.Int8{Int64: *p.CompressedSizeBytes, Valid: true}
		}
		if base.CompressedSizeBytes.Valid {
			if p.CompressedSizeBytes == nil || *p.CompressedSizeBytes < 0 || *p.CompressedSizeBytes > math.MaxInt64-base.CompressedSizeBytes.Int64 {
				return fmt.Errorf("invalid manifest compressed size")
			}
			base.CompressedSizeBytes.Int64 += *p.CompressedSizeBytes
		}
		rows = append(rows, row)
	}
	_, err := BuildLogparsePrefixManifest(base, rows, rows)
	return err
}

func prefixPart(row database.LogFilePart, fileID uuid.UUID) (LogparsePrefixPart, error) {
	if row.ID == uuid.Nil || row.LogFileID != fileID || row.UploadID == uuid.Nil || row.ReservationID == uuid.Nil || row.Sequence <= 0 || strings.TrimSpace(row.ObjectKey) == "" || row.Status != "ready" || !row.Hash.Valid || strings.TrimSpace(row.Hash.String) == "" || !row.SizeBytes.Valid || row.SizeBytes.Int64 < 0 || !row.FinalizedAt.Valid || row.FinalizedAt.InfinityModifier != pgtype.Finite || row.FinalizedAt.Time.IsZero() {
		return LogparsePrefixPart{}, fmt.Errorf("missing or invalid ready part metadata")
	}
	if err := prefixEncoding(row.ContentEncoding, row.CompressedSizeBytes); err != nil {
		return LogparsePrefixPart{}, err
	}
	return LogparsePrefixPart{ID: row.ID, LogFileID: row.LogFileID, UploadID: row.UploadID, ReservationID: row.ReservationID, Sequence: row.Sequence, SourceSequence: prefixInt(row.SourceSequence), ObjectKey: row.ObjectKey, Status: row.Status, Hash: row.Hash.String, SizeBytes: row.SizeBytes.Int64, CompressedSizeBytes: prefixInt(row.CompressedSizeBytes), ContentEncoding: prefixText(row.ContentEncoding), FinalizedAt: row.FinalizedAt.Time.UTC()}, nil
}
func prefixEncoding(encoding pgtype.Text, size pgtype.Int8) error {
	if size.Valid && size.Int64 < 0 {
		return fmt.Errorf("negative compressed size")
	}
	if encoding.Valid && encoding.String != "gzip" {
		return fmt.Errorf("unsupported content encoding")
	}
	if encoding.Valid && !size.Valid {
		return fmt.Errorf("gzip compressed size missing")
	}
	return nil
}
func prefixInt(v pgtype.Int8) *int64 {
	if !v.Valid {
		return nil
	}
	n := v.Int64
	return &n
}
func prefixText(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}
func prefixEqual(a, b any) bool { return reflect.DeepEqual(a, b) }
func prefixLess(a, b LogparsePrefixPart) bool {
	if (a.SourceSequence == nil) != (b.SourceSequence == nil) {
		return a.SourceSequence != nil
	}
	av, bv := a.Sequence, b.Sequence
	if a.SourceSequence != nil {
		av = *a.SourceSequence
	}
	if b.SourceSequence != nil {
		bv = *b.SourceSequence
	}
	if av != bv {
		return av < bv
	}
	if a.Sequence != b.Sequence {
		return a.Sequence < b.Sequence
	}
	return strings.Compare(a.ID.String(), b.ID.String()) < 0
}
