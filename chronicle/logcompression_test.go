package chronicle

import (
	"bytes"
	"compress/gzip"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/klauspost/compress/zstd"
)

func TestRawLogCompression(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name         string
		logType      database.LogType
		wantEncoding string
	}{
		{name: "immutable client log", logType: database.LogTypeV2, wantEncoding: "zstd"},
		{name: "appendable server log", logType: database.LogTypeAzerothcore, wantEncoding: "gzip"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			encoding, compress := rawLogCompression(test.logType)
			if encoding != test.wantEncoding {
				t.Fatalf("rawLogCompression() encoding = %q, want %q", encoding, test.wantEncoding)
			}
			if compress == nil {
				t.Fatal("rawLogCompression() returned a nil compressor")
			}
		})
	}
}

func TestCompressRawLog(t *testing.T) {
	t.Parallel()

	input := []byte(strings.Repeat("8/6 20:15:01.123  SPELL_DAMAGE,Player-1,Creature-2,1234\n", 1_000))
	var compressed bytes.Buffer

	written, err := compressRawLog(&compressed, bytes.NewReader(input))
	if err != nil {
		t.Fatal(err)
	}
	if written != int64(len(input)) {
		t.Fatalf("compressRawLog() wrote %d bytes, want %d", written, len(input))
	}
	if !bytes.HasPrefix(compressed.Bytes(), []byte{0x28, 0xb5, 0x2f, 0xfd}) {
		t.Fatal("compressRawLog() did not produce a Zstandard frame")
	}

	reader, err := decompressLog(compressed.Bytes(), "zstd")
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, input) {
		t.Fatal("Zstandard round trip changed the raw log")
	}
}

func TestGzipLogData(t *testing.T) {
	t.Parallel()

	first := []byte("first log chunk\n")
	second := []byte("second log chunk\n")

	firstGzip, err := gzipLogData(bytes.NewReader(first), false)
	if err != nil {
		t.Fatal(err)
	}
	secondGzip, err := gzipLogData(bytes.NewReader(second), false)
	if err != nil {
		t.Fatal(err)
	}
	preserved, err := gzipLogData(bytes.NewReader(secondGzip), true)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(preserved, secondGzip) {
		t.Fatal("gzipLogData() changed an existing gzip stream")
	}

	combined := append(append([]byte(nil), firstGzip...), preserved...)
	reader, err := decompressLog(combined, "gzip")
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	want := append(append([]byte(nil), first...), second...)
	if !bytes.Equal(got, want) {
		t.Fatalf("decompressed appended log = %q, want %q", got, want)
	}
}

func TestDecompressLog(t *testing.T) {
	t.Parallel()

	input := []byte("8/6 20:15:01.123  SPELL_DAMAGE,Player-1,Creature-2,1234\n")

	var gzipData bytes.Buffer
	gzipWriter := gzip.NewWriter(&gzipData)
	if _, err := gzipWriter.Write(input); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}

	var zstdData bytes.Buffer
	zstdWriter, err := zstd.NewWriter(&zstdData)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := zstdWriter.Write(input); err != nil {
		t.Fatal(err)
	}
	if err := zstdWriter.Close(); err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		name     string
		encoding string
		data     []byte
	}{
		{name: "plaintext", data: input},
		{name: "gzip", encoding: "gzip", data: gzipData.Bytes()},
		{name: "zstd", encoding: "zstd", data: zstdData.Bytes()},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			reader, err := decompressLog(test.data, test.encoding)
			if err != nil {
				t.Fatal(err)
			}
			got, err := io.ReadAll(reader)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, input) {
				t.Fatalf("decompressLog() = %q, want %q", got, input)
			}
		})
	}
}

func TestDecompressLogRejectsUnsupportedEncoding(t *testing.T) {
	t.Parallel()

	_, err := decompressLog(nil, "brotli")
	if err == nil {
		t.Fatal("decompressLog() accepted an unsupported encoding")
	}
}
