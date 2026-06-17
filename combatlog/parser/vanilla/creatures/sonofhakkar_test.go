package creatures_test

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/merge"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

func TestSonOfHakkar(t *testing.T) {
	t.Parallel()
	t.Skip("moving to v2")

	raw, err := os.OpenFile("testdata/sonofhakker/WoWRawCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)
	logs, err := os.OpenFile("testdata/sonofhakker/WoWCombatLog.txt", os.O_RDONLY, 0644)
	require.NoError(t, err)

	ctx := testutil.Context(t, testutil.WaitSuperLong)
	ctx = parseoptions.WithVerbose(ctx, true)
	logger := testutil.Logger(t)

	m := merge.NewMerger(logger)
	liner, scans, err := m.LineScanner(ctx, nil, logfile.New(nil, raw), logfile.New(nil, logs))
	require.NoError(t, err)

	p := vanilla.NewFromScanner(context.Background(), logger, liner, scans, nil)
	output := encounters.New(ctx, logger, nil)
	for {
		msgs, err := p.Advance(ctx)
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)

		for _, msg := range msgs {
			err = output.Process(msg)
			require.NoError(t, err)
		}
	}

	// Analyze the results here as needed.
	fights := output.CurrentInstance.Fights()
	t.Logf("Number of fights: %d", len(fights))
	for i, f := range fights {
		t.Logf("Fight[%d]: EncounterID=%s, Hostiles=%d, Start=%s, End=%s",
			i, f.EncounterID, len(f.Hostiles), f.Start.Format("15:04:05"), f.End.Format("15:04:05"))
	}
	require.GreaterOrEqual(t, len(fights), 1, "expected at least 1 fight")

	// Get the global events (all fights merged into one Events struct)
	// Target GUID we're looking for: 0xF130002C5D00BF8A
	targetGUID := "0xF130002C5D00BF8A"

	globalEvents := output.CurrentInstance.Events()
	require.NotNil(t, globalEvents, "globalEvents is nil")

	// The damage data contains multiple encounters concatenated together
	// Format: [header1][body1][header2][body2]...
	damageData := globalEvents.Damage
	t.Logf("Total damage data length: %d bytes", len(damageData))

	// Parse all encounters
	var starfireEvents []*chronicleproto.Damage
	var eventsToTarget []*chronicleproto.Damage
	encounterNum := 0

	for len(damageData) > 0 {
		encounterNum++

		// Decode header: encounterID (string), timestamp (varint), count (varint), bodyLen (varint)
		encounterID, n := protowire.ConsumeString(damageData)
		require.True(t, n > 0, "failed to read encounterID for encounter %d", encounterNum)
		damageData = damageData[n:]

		timestamp, n := protowire.ConsumeVarint(damageData)
		require.True(t, n > 0, "failed to read timestamp for encounter %d", encounterNum)
		damageData = damageData[n:]

		count, n := protowire.ConsumeVarint(damageData)
		require.True(t, n > 0, "failed to read count for encounter %d", encounterNum)
		damageData = damageData[n:]

		bodyLen, n := protowire.ConsumeVarint(damageData)
		require.True(t, n > 0, "failed to read bodyLen for encounter %d", encounterNum)
		damageData = damageData[n:]

		t.Logf("Encounter[%d]: ID=%s, timestamp=%d, count=%d, bodyLen=%d",
			encounterNum, encounterID, timestamp, count, bodyLen)

		// Parse each damage event in this encounter
		for i := 0; i < int(count); i++ {
			// Each event is prefixed with its length
			msgLen, n := protowire.ConsumeVarint(damageData)
			require.True(t, n > 0, "failed to read message length at event %d in encounter %d", i, encounterNum)
			damageData = damageData[n:]

			msgData := damageData[:msgLen]
			damageData = damageData[msgLen:]

			var dmg chronicleproto.Damage
			err := proto.Unmarshal(msgData, &dmg)
			require.NoError(t, err, "failed to unmarshal damage event %d in encounter %d", i, encounterNum)

			// Check if this is a starfire hit on our target
			if dmg.SourceName == "Starfire" {
				starfireEvents = append(starfireEvents, &dmg)
			}
			if dmg.Target == targetGUID {
				eventsToTarget = append(eventsToTarget, &dmg)
			}
		}
	}

	t.Logf("Parsed %d encounters total", encounterNum)
	t.Logf("Found %d Starfire events total", len(starfireEvents))
	for i, evt := range starfireEvents {
		t.Logf("  Starfire[%d]: caster=%v target=%s amount=%d", i, evt.Caster, evt.Target, evt.Amount)
	}

	t.Logf("Found %d events targeting %s", len(eventsToTarget), targetGUID)
	for i, evt := range eventsToTarget {
		t.Logf("  Event[%d]: source=%s caster=%v amount=%d", i, evt.SourceName, evt.Caster, evt.Amount)
	}

	// Assert that starfire hitting our target exists in the events
	var foundStarfireToTarget bool
	for _, evt := range starfireEvents {
		if evt.Target == targetGUID {
			foundStarfireToTarget = true
			t.Logf("Found Starfire event targeting %s with amount %d", targetGUID, evt.Amount)
			break
		}
	}
	require.True(t, foundStarfireToTarget, "Expected to find Starfire event targeting %s in damage events", targetGUID)
}
