package modern

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestTypedRecordsKeepObservationsWithInput(t *testing.T) {
	t.Parallel()
	input := `10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1
10/7/2026 22:00:02.1239  SWING_DAMAGE_LANDED,Player-4618-00C7EC79,"First-Normal-US",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,1
10/7/2026 22:00:01.000  SWING_DAMAGE_LANDED,Player-4618-00C7EC79,"Second-Normal-EU",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,1`
	r := newTransformReader(strings.NewReader(input))
	header, err := r.NextRecord()
	require.NoError(t, err)
	require.Empty(t, header.Metadata)
	first, err := r.NextRecord()
	require.NoError(t, err)
	require.Empty(t, first.Line)
	require.Len(t, first.Metadata, 1)
	second, err := r.NextRecord()
	require.NoError(t, err)
	require.Empty(t, second.Line)
	require.Len(t, second.Metadata, 1)
	a := first.Metadata[0].(*messages.PlayerRealm)
	b := second.Metadata[0].(*messages.PlayerRealm)
	require.Equal(t, "First", a.Name)
	require.Equal(t, "Normal-US", a.Realm.RawName)
	require.Equal(t, "Second", b.Name)
	require.Equal(t, "Normal-EU", b.Realm.RawName)
	require.Equal(t, time.Date(2026, 10, 7, 22, 0, 2, 123000000, time.UTC), a.Date())
	require.Equal(t, time.Date(2026, 10, 7, 22, 0, 1, 0, time.UTC), b.Date())
	for i := 0; i < 2; i++ {
		record, err := r.NextRecord()
		require.ErrorIs(t, err, io.EOF)
		require.Empty(t, record.Metadata)
	}
	// Metadata-only records still participate in timestamp regression checks.
	p, err := New(context.Background(), slog.Default(), strings.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	for i := 0; i < 3; i++ {
		_, err = p.Advance(context.Background())
		require.NoError(t, err)
	}
	_, err = p.Advance(context.Background())
	require.ErrorIs(t, err, io.EOF)
}

func TestTypedRecordErrorDoesNotLeakMetadata(t *testing.T) {
	t.Parallel()
	input := `10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1
10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Normal-US",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000`
	r := newTransformReader(strings.NewReader(input))
	_, err := r.NextRecord()
	require.NoError(t, err)
	for i := 0; i < 2; i++ {
		record, err := r.NextRecord()
		require.Error(t, err)
		require.Empty(t, record.Metadata)
		require.Empty(t, record.Line)
	}
}

func TestTypedRecordsTelemetryOwnsNoMetadata(t *testing.T) {
	t.Parallel()
	input := `10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1
10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Normal-US",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20,Player-4618-00C7EC79,0000000000000000,18,42,3,4,20,5,0,0,0,20,40,0,1751.67,1697.84,1420,4.4674,1`
	r := newTransformReader(strings.NewReader(input))
	_, err := r.NextRecord()
	require.NoError(t, err)
	event, err := r.NextRecord()
	require.NoError(t, err)
	require.Len(t, event.Metadata, 1)
	require.Contains(t, event.Line, "SPELL_CAST_SUCCESS")
	for _, kind := range []string{"BLIZZARD_UNIT_POSITION", "BLIZZARD_UNIT_RESOURCES"} {
		record, err := r.NextRecord()
		require.NoError(t, err)
		require.Contains(t, record.Line, kind)
		require.Empty(t, record.Metadata)
	}
	_, err = r.NextRecord()
	require.ErrorIs(t, err, io.EOF)
}
