package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
)

// TestLogTypeFormat pins the LogType->LogFormat collapse. These mappings are
// persisted downstream (and mirrored by the backfill in migration 000123), so a
// change here is a deliberate, migration-worthy edit.
func TestLogTypeFormat(t *testing.T) {
	t.Parallel()

	cases := []struct {
		logType database.LogType
		want    database.LogFormat
	}{
		{database.LogTypeV1, database.LogFormat112aSuperwowAddon},
		{database.LogTypeV2, database.LogFormat112aCcAddon},
		{database.LogTypeKronos, database.LogFormat112aCcAddon},
		{database.LogTypeWarmane, database.LogFormat335aCcAddon},
		{database.LogTypeEpoch, database.LogFormat335aCcAddon},
		{database.LogTypeAzerothcoreClientside, database.LogFormat335aCcAddon},
		{database.LogTypeAzerothcore, database.LogFormatAzerothcoreMod},
	}

	for _, tc := range cases {
		t.Run(string(tc.logType), func(t *testing.T) {
			t.Parallel()
			if got := tc.logType.Format(); got != tc.want {
				t.Fatalf("LogType(%q).Format() = %q, want %q", tc.logType, got, tc.want)
			}
		})
	}
}

// TestLogTypeFormatExhaustive guards against a new LogType being added without a
// corresponding format mapping: every valid LogType must map to a valid format.
func TestLogTypeFormatExhaustive(t *testing.T) {
	t.Parallel()

	for _, lt := range database.AllLogTypeValues() {
		if got := lt.Format(); !got.Valid() {
			t.Errorf("LogType(%q).Format() = %q, which is not a valid LogFormat; add it to LogType.Format", lt, got)
		}
	}
}

// TestUnknownLogTypeFormat documents that an unknown LogType yields the empty
// (invalid) format rather than panicking or guessing.
func TestUnknownLogTypeFormat(t *testing.T) {
	t.Parallel()

	got := database.LogType("not-a-real-type").Format()
	if got != "" {
		t.Fatalf("unknown LogType.Format() = %q, want empty", got)
	}
	if got.Valid() {
		t.Fatalf("empty LogFormat should be invalid")
	}
}
