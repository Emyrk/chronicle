package cli

import (
	"bytes"
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func wowTestChunk(tag string, payload []byte) []byte {
	data := make([]byte, 8+len(payload))
	for index := range tag {
		data[index] = tag[len(tag)-index-1]
	}
	binary.LittleEndian.PutUint32(data[4:], uint32(len(payload)))
	copy(data[8:], payload)
	return data
}

func TestExportWowdataFileRetriesTransientFailures(t *testing.T) {
	dir := t.TempDir()
	binaryPath := filepath.Join(dir, "wowdata")
	counterPath := filepath.Join(dir, "attempts")
	outputPath := filepath.Join(dir, "asset.adt")
	require.NoError(t, os.WriteFile(binaryPath, []byte(`#!/usr/bin/env bash
set -euo pipefail
attempt=0
[[ ! -f "${COUNTER_PATH}" ]] || attempt="$(cat "${COUNTER_PATH}")"
attempt=$((attempt + 1))
printf '%s' "${attempt}" > "${COUNTER_PATH}"
output=""
while (($#)); do
  if [[ "$1" == "--output" ]]; then
    output="$2"
    break
  fi
  shift
done
if ((attempt < 3)); then
  printf 'transient export failure\n' >&2
  exit 1
fi
printf 'geometry' > "${output}"
`), 0o755))
	t.Setenv("COUNTER_PATH", counterPath)

	var stderr bytes.Buffer
	err := exportWowdataFileWithRetries(
		context.Background(),
		&stderr,
		wowMapExtractOptions{WowdataBin: binaryPath},
		7288580,
		outputPath,
		[]time.Duration{0, 0},
	)
	require.NoError(t, err)
	require.Equal(t, "3", string(requireFile(t, counterPath)))
	require.Equal(t, "geometry", string(requireFile(t, outputPath)))
	require.Contains(t, stderr.String(), "Retrying FileDataID 7288580")
}

func requireFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	return data
}

func TestParseWDTADTRootFileDataIDs(t *testing.T) {
	t.Parallel()

	payload := make([]byte, 64)
	binary.LittleEndian.PutUint32(payload[0:], 101)
	binary.LittleEndian.PutUint32(payload[32:], 202)

	tiles, err := parseWDTADTRootFileDataIDs(wowTestChunk("MAID", payload))
	require.NoError(t, err)
	require.Equal(t, []wdtADTTile{
		{FileDataID: 101, Column: 0, Row: 0},
		{FileDataID: 202, Column: 1, Row: 0},
	}, tiles)
}

func TestParseWMOGroupFileDataIDs(t *testing.T) {
	t.Parallel()

	payload := make([]byte, 8)
	binary.LittleEndian.PutUint32(payload[0:], 301)
	binary.LittleEndian.PutUint32(payload[4:], 302)

	ids, err := parseWMOGroupFileDataIDs(wowTestChunk("GFID", payload))
	require.NoError(t, err)
	require.Equal(t, []int32{301, 302}, ids)
}

func TestParseGlobalWMOPlacement(t *testing.T) {
	t.Parallel()

	payload := make([]byte, 64)
	binary.LittleEndian.PutUint32(payload[0:], 401)
	binary.LittleEndian.PutUint32(payload[8:], math.Float32bits(1.5))
	binary.LittleEndian.PutUint16(payload[62:], 1024)

	placements, rootID, err := parseGlobalWMOPlacement(wowTestChunk("MODF", payload))
	require.NoError(t, err)
	require.Equal(t, int32(401), rootID)
	require.Len(t, placements, 1)
	require.Equal(t, float32(1.5), placements[0].Position[0])
	require.Equal(t, float32(1), placements[0].Scale)
}
