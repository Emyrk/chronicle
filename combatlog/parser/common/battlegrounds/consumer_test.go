package battlegrounds_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/battlegrounds"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func at(seconds int) time.Time {
	return time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC).Add(time.Duration(seconds) * time.Second)
}
func zoneAt(seconds int, mapID uint32) messages.Message {
	return &messages.Zone{MessageBase: messages.Base(at(seconds)), Zone: zone.Zone{MapID: mapID, InstanceID: 999}}
}
func known(mapID uint32) bool { return mapID == 1 || mapID == 2 }
func header(version string) messages.Message {
	return &messages.Versions{MessageBase: messages.Base(at(0)), Versions: map[string]string{"combat_log": version}}
}

func TestLifecycleAndSink(t *testing.T) {
	t.Parallel()
	var ids []uint64
	var received []messages.Message
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, func(id uint64, m messages.Message) error {
		ids = append(ids, id)
		received = append(received, m)
		return nil
	})
	require.NoError(t, err)
	input := []messages.Message{
		header("22"),
		&messages.Damage{MessageBase: messages.Base(at(1))}, // no zone evidence
		zoneAt(2, 100), // world
		zoneAt(3, 1),   // first episode
		&messages.UnitDied{MessageBase: messages.Base(at(4))},
		&messages.Slain{MessageBase: messages.Base(at(5))},
		zoneAt(3600, 1), // long idle, still same episode, InstanceID is irrelevant
		&messages.Damage{MessageBase: messages.Base(at(3601))},
		zoneAt(3700, 2),   // directly into another BG
		zoneAt(3800, 100), // out
		&messages.Heal{MessageBase: messages.Base(at(3900))}, // world event excluded
		zoneAt(4000, 1), // reentry gets a new local ID
		&messages.Damage{MessageBase: messages.Base(at(4100))}, // drained tail
	}
	for _, m := range input {
		require.NoError(t, s.Process(m))
	}
	require.Empty(t, s.Episodes()[2].CloseReason)
	require.NoError(t, s.Finish())
	require.NoError(t, s.Finish())
	require.Equal(t, []battlegrounds.Episode{
		{ID: 1, MapID: 1, FirstObservedAt: at(3), LastObservedAt: at(3601), ExitAt: at(3700), CloseReason: battlegrounds.CloseZoneChange},
		{ID: 2, MapID: 2, FirstObservedAt: at(3700), LastObservedAt: at(3700), ExitAt: at(3800), CloseReason: battlegrounds.CloseZoneChange},
		{ID: 3, MapID: 1, FirstObservedAt: at(4000), LastObservedAt: at(4100), CloseReason: battlegrounds.CloseEOF},
	}, s.Episodes())
	require.Equal(t, []uint64{1, 1, 1, 1, 1, 2, 3, 3}, ids)
	require.Equal(t, []messages.Message{input[3], input[4], input[5], input[6], input[7], input[8], input[11], input[12]}, received)
	snapshot := s.Episodes()
	snapshot[0].MapID = 888
	require.Equal(t, uint32(1), s.Episodes()[0].MapID)
	require.ErrorContains(t, s.Process(zoneAt(4200, 1)), "after finish")
	require.Len(t, s.Episodes(), 3)
}

func TestNoZoneEvidence(t *testing.T) {
	t.Parallel()
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, func(uint64, messages.Message) error {
		t.Fatal("unexpected attributed event")
		return nil
	})
	require.NoError(t, err)
	for _, m := range []messages.Message{header("22"), &messages.Damage{MessageBase: messages.Base(at(1))}, &messages.UnitDied{MessageBase: messages.Base(at(2))}} {
		require.NoError(t, s.Process(m))
	}
	require.NoError(t, s.Finish())
	require.Empty(t, s.Episodes())
}

func TestFormatGate(t *testing.T) {
	t.Parallel()
	for _, format := range append(database.AllLogFormatValues(), "", "unknown", "v20-cleu", "v21-cleu") {
		if format == database.LogFormatV22Cleu {
			continue
		}
		t.Run(string(format), func(t *testing.T) {
			t.Parallel()
			s, err := battlegrounds.New(format, known, nil)
			require.Error(t, err)
			require.Nil(t, s)
		})
	}
	s, err := battlegrounds.New(database.LogFormatV22Cleu, nil, nil)
	require.Error(t, err)
	require.Nil(t, s)
}

func TestHeaderConflictsAreTerminal(t *testing.T) {
	t.Parallel()
	for _, version := range []string{"", "9", "20", "21", "23", "v22", "invalid"} {
		t.Run(version, func(t *testing.T) {
			t.Parallel()
			calls := 0
			s, err := battlegrounds.New(database.LogFormatV22Cleu, known, func(uint64, messages.Message) error { calls++; return nil })
			require.NoError(t, err)
			require.NoError(t, s.Process(header("22")))
			require.NoError(t, s.Process(zoneAt(1, 1)))
			err = s.Process(header(version))
			require.ErrorContains(t, err, "unsupported combat_log")
			require.Same(t, err, s.Process(header("22")))
			require.Same(t, err, s.Process(zoneAt(2, 2)))
			require.Same(t, err, s.Finish())
			require.Equal(t, 1, calls)
			require.Len(t, s.Episodes(), 1)
			require.Empty(t, s.Episodes()[0].CloseReason)
		})
	}
}

func TestMetadataOnlyAndLatestObservation(t *testing.T) {
	t.Parallel()
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, nil)
	require.NoError(t, err)
	require.NoError(t, s.Process(&messages.Versions{MessageBase: messages.Base(at(0)), Versions: map[string]string{"addon": "1"}}))
	require.NoError(t, s.Process(zoneAt(1, 1)))
	require.NoError(t, s.Process(&messages.Heal{MessageBase: messages.Base(at(10))}))
	require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(at(5))}))
	require.NoError(t, s.Finish())
	require.Equal(t, at(10), s.Episodes()[0].LastObservedAt)
	require.True(t, s.Episodes()[0].ExitAt.IsZero())
}

func TestSinkFailureIsTerminal(t *testing.T) {
	t.Parallel()
	failure := errors.New("encoding failed")
	calls := 0
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, func(uint64, messages.Message) error { calls++; return failure })
	require.NoError(t, err)
	require.ErrorIs(t, s.Process(zoneAt(1, 1)), failure)
	require.ErrorIs(t, s.Process(zoneAt(2, 2)), failure)
	require.ErrorIs(t, s.Finish(), failure)
	require.Equal(t, 1, calls)
}

func TestEmptyFinish(t *testing.T) {
	t.Parallel()
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, nil)
	require.NoError(t, err)
	require.NoError(t, s.Finish())
	require.NoError(t, s.Finish())
	require.Empty(t, s.Episodes())
}

func TestConflictBeforeZone(t *testing.T) {
	t.Parallel()
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, nil)
	require.NoError(t, err)
	err = s.Process(header("21"))
	require.Error(t, err)
	require.Same(t, err, s.Process(zoneAt(1, 1)))
	require.Same(t, err, s.Finish())
	require.Empty(t, s.Episodes())
}

func TestMapEvidenceNotInstanceIdentity(t *testing.T) {
	t.Parallel()
	s, err := battlegrounds.New(database.LogFormatV22Cleu, known, nil)
	require.NoError(t, err)
	// InstanceID alone cannot open a battleground episode.
	require.NoError(t, s.Process(&messages.Zone{MessageBase: messages.Base(at(1)), Zone: zone.Zone{InstanceID: 1}}))
	require.Empty(t, s.Episodes())
	require.NoError(t, s.Process(zoneAt(2, 1)))
	// A different InstanceID is not evidence of a new match or episode.
	require.NoError(t, s.Process(&messages.Zone{MessageBase: messages.Base(at(3)), Zone: zone.Zone{MapID: 1, InstanceID: 123}}))
	require.NoError(t, s.Finish())
	require.Len(t, s.Episodes(), 1)
	require.Equal(t, at(2), s.Episodes()[0].FirstObservedAt)
	require.Equal(t, at(3), s.Episodes()[0].LastObservedAt)
}
