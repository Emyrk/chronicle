package cli

import (
	"bytes"
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"sync"
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

func TestClearRenderedWowMapInstances(t *testing.T) {
	t.Parallel()

	manifest := wowMapManifest{Instances: []wowMapInstance{
		{MapID: 43, Rendered: &wowMapRenderedInstance{Path: "render/43.png"}, Styled: &wowMapRenderedInstance{Path: "render-styled/43.jpeg"}},
		{MapID: 2998, Rendered: &wowMapRenderedInstance{Path: "render/2998.png"}},
	}}
	clearRenderedWowMapInstances(&manifest)
	require.Nil(t, manifest.Instances[0].Rendered)
	require.Nil(t, manifest.Instances[0].Styled)
	require.Nil(t, manifest.Instances[1].Rendered)
}

func TestRenderedWowMapAssetPathIncludesContentDigest(t *testing.T) {
	t.Parallel()

	first := renderedWowMapAssetPath(43, "1.60.1.70338", []byte("first render"))
	second := renderedWowMapAssetPath(43, "1.60.1.70338", []byte("second render"))
	require.Regexp(t, `^render/43-1\.60\.1\.70338-[0-9a-f]{12}\.png$`, first)
	require.NotEqual(t, first, second)
}

func TestPrefixedLineWriterBuffersPartialLines(t *testing.T) {
	t.Parallel()

	var destination bytes.Buffer
	writer := &prefixedLineWriter{
		destination: &destination,
		mutex:       &sync.Mutex{},
		prefix:      "map 43 WMO group 1/23 FileDataID 100",
	}
	_, err := writer.Write([]byte("prepare target="))
	require.NoError(t, err)
	_, err = writer.Write([]byte("remote\nprepare status=ready"))
	require.NoError(t, err)
	require.NoError(t, writer.Flush())
	require.Equal(t,
		"[map 43 WMO group 1/23 FileDataID 100] prepare target=remote\n"+
			"[map 43 WMO group 1/23 FileDataID 100] prepare status=ready\n",
		destination.String(),
	)
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
		"map 2998 ADT 36,38 FileDataID 7288580",
		&sync.Mutex{},
		[]time.Duration{0, 0},
	)
	require.NoError(t, err)
	require.Equal(t, "3", string(requireFile(t, counterPath)))
	require.Equal(t, "geometry", string(requireFile(t, outputPath)))
	require.Contains(t, stderr.String(), "[map 2998 ADT 36,38 FileDataID 7288580] transient export failure")
	require.Contains(t, stderr.String(), "[map 2998 ADT 36,38 FileDataID 7288580] retrying after export failure")
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
