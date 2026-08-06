package chronicle

import (
	"bytes"
	"compress/gzip"
	"io"
	"strings"
	"testing"

	"github.com/klauspost/compress/zstd"
)

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
