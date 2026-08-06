package chronicle

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"

	"github.com/klauspost/compress/zstd"
)

func compressGzipLog(dst io.Writer, src io.Reader) (int64, error) {
	encoder := gzip.NewWriter(dst)
	written, copyErr := io.Copy(encoder, src)
	closeErr := encoder.Close()
	if copyErr != nil {
		return 0, copyErr
	}
	if closeErr != nil {
		return 0, fmt.Errorf("close gzip writer: %w", closeErr)
	}
	return written, nil
}

// rawLogZstdLevel selects the encoder preset closest to Zstandard level 10.
const rawLogZstdLevel = 10

func compressRawLog(dst io.Writer, src io.Reader) (int64, error) {
	encoder, err := zstd.NewWriter(dst,
		zstd.WithEncoderLevel(zstd.EncoderLevelFromZstd(rawLogZstdLevel)),
	)
	if err != nil {
		return 0, fmt.Errorf("create zstd writer: %w", err)
	}

	written, copyErr := io.Copy(encoder, src)
	closeErr := encoder.Close()
	if copyErr != nil {
		return 0, copyErr
	}
	if closeErr != nil {
		return 0, fmt.Errorf("close zstd writer: %w", closeErr)
	}
	return written, nil
}

func decompressLog(data []byte, encoding string) (io.Reader, error) {
	var reader io.Reader = bytes.NewReader(data)

	switch encoding {
	case "":
		return reader, nil
	case "gzip":
		decoder, err := gzip.NewReader(reader)
		if err != nil {
			return nil, err
		}
		defer func() { _ = decoder.Close() }()
		reader = decoder
	case "zstd":
		decoder, err := zstd.NewReader(reader)
		if err != nil {
			return nil, err
		}
		defer decoder.Close()
		reader = decoder
	default:
		return nil, fmt.Errorf("unsupported content encoding %q", encoding)
	}

	decompressed := bytes.NewBuffer(nil)
	if _, err := io.Copy(decompressed, reader); err != nil {
		return nil, err
	}
	return decompressed, nil
}
