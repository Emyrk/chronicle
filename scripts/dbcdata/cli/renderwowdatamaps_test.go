package cli

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
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

func TestRenderedWowMapAssetPathIncludesContentDigest(t *testing.T) {
	t.Parallel()

	first := renderedWowMapAssetPath(43, "1.60.1.70338", []byte("first render"))
	second := renderedWowMapAssetPath(43, "1.60.1.70338", []byte("second render"))
	require.Regexp(t, `^renders/43-1\.60\.1\.70338-[0-9a-f]{12}\.png$`, first)
	require.NotEqual(t, first, second)
}

func TestGeneratedRendersLayerMatchesMerger(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	original := filepath.Join(dir, "manifest.original.json")
	generated := filepath.Join(dir, "manifest.generated-renders.json")
	out := filepath.Join(dir, "manifest.json")
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	require.NoError(t, writeWowMapManifest(original, wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43, Name: "Wailing Caverns"}}}))
	asset := &wowMapManualRender{Path: renderedWowMapAssetPath(43, target.Build, []byte("png")), Width: 1200, Height: 800}
	require.NoError(t, writeWowMapLayer(generated, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Name: "Wailing Caverns", Renders: asset}}}))
	require.NoError(t, mergeWowdataMaps(original, "", "", generated, out))
	require.Contains(t, string(requireFile(t, out)), `"renders": {`)
	require.NotContains(t, string(requireFile(t, out)), `"rendered":`)
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

// Not parallel: this test deliberately keeps multiple fake exporter processes alive.
func TestExportWowdataFilesSerializesPreparationAndOverlapsExports(t *testing.T) {
	dir := t.TempDir()
	leaderLock := filepath.Join(dir, "leader-lock")
	leaderPreparing := filepath.Join(dir, "leader-preparing")
	allowReady := filepath.Join(dir, "allow-ready")
	leaderReady := filepath.Join(dir, "leader-ready")
	followerStarted := filepath.Join(dir, "follower-started")
	violation := filepath.Join(dir, "preparation-overlapped")
	binary := filepath.Join(dir, "wowdata")
	require.NoError(t, os.WriteFile(binary, []byte(fmt.Sprintf(`#!/usr/bin/env bash
set -euo pipefail
output=""
while (($#)); do
  if [[ "$1" == "--output" ]]; then
    output="$2"
    shift 2
    continue
  fi
  shift
done
if mkdir %q 2>/dev/null; then
  touch %q
  while [[ ! -f %q ]]; do sleep 0.01; done
  touch %q
  printf 'prepare status=ready\n' >&2
  while [[ ! -f %q ]]; do sleep 0.01; done
else
  touch %q
  [[ -f %q ]] || touch %q
  printf 'prepare status=ready\n' >&2
fi
printf 'geometry' > "$output"
`, leaderLock, leaderPreparing, allowReady, leaderReady, followerStarted, followerStarted, leaderReady, violation)), 0o755))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	firstOutput := filepath.Join(dir, "first.wmo")
	secondOutput := filepath.Join(dir, "second.wmo")
	result := make(chan error, 1)
	go func() {
		result <- exportWowdataFiles(ctx, &bytes.Buffer{}, wowMapExtractOptions{WowdataBin: binary}, []wowdataFileExport{
			{FileDataID: 101, Output: firstOutput, Label: "first"},
			{FileDataID: 102, Output: secondOutput, Label: "second"},
		}, 2)
	}()

	require.Eventually(t, func() bool {
		_, err := os.Stat(leaderPreparing)
		return err == nil
	}, time.Second, 10*time.Millisecond)
	require.NoFileExists(t, followerStarted)
	require.NoError(t, os.WriteFile(allowReady, nil, 0o644))
	select {
	case err := <-result:
		require.NoError(t, err)
	case <-ctx.Done():
		require.FailNow(t, "renderer exports did not overlap after preparation", ctx.Err().Error())
	}
	require.NoFileExists(t, violation)
	require.FileExists(t, followerStarted)
	require.Equal(t, "geometry", string(requireFile(t, firstOutput)))
	require.Equal(t, "geometry", string(requireFile(t, secondOutput)))
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
