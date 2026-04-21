package wdb

import (
	"encoding/binary"
	"fmt"
	"io"
)

// Signature identifies the WDB cache type.
type Signature [4]byte

var (
	SigItem     = Signature{'B', 'D', 'I', 'W'}
	SigCreature = Signature{'B', 'O', 'M', 'W'}
)

func (s Signature) String() string {
	return string(s[:])
}

// Header is present at the start of all WDB files.
// Vanilla/TBC (pre-3.0.8): 20 bytes (no CacheVersion field).
// WotLK+ (build >= 12340): 24 bytes (includes CacheVersion).
type Header struct {
	Signature     Signature
	Version       uint32
	Locale        [4]byte
	RecordSize    uint32
	RecordVersion uint32
	CacheVersion  uint32 // Only present in WotLK+ (3.0.8+). Zero for older clients.
}

// Record is a single entry in a WDB file.
type Record struct {
	EntryID uint32
	Data    []byte
}

// Parse reads the header and all records from a WDB file.
// Records end when an entry ID of 0 is encountered or the reader is exhausted.
func Parse(r io.Reader) (Header, []Record, error) {
	var h Header
	if err := binary.Read(r, binary.LittleEndian, &h.Signature); err != nil {
		return h, nil, fmt.Errorf("read signature: %w", err)
	}
	if err := binary.Read(r, binary.LittleEndian, &h.Version); err != nil {
		return h, nil, fmt.Errorf("read version: %w", err)
	}
	if err := binary.Read(r, binary.LittleEndian, &h.Locale); err != nil {
		return h, nil, fmt.Errorf("read locale: %w", err)
	}
	if err := binary.Read(r, binary.LittleEndian, &h.RecordSize); err != nil {
		return h, nil, fmt.Errorf("read record size: %w", err)
	}
	if err := binary.Read(r, binary.LittleEndian, &h.RecordVersion); err != nil {
		return h, nil, fmt.Errorf("read record version: %w", err)
	}

	// WotLK+ (build 12340 = 3.3.5a) added a CacheVersion field.
	if h.Version >= 12340 {
		if err := binary.Read(r, binary.LittleEndian, &h.CacheVersion); err != nil {
			return h, nil, fmt.Errorf("read cache version: %w", err)
		}
	}

	var records []Record
	for {
		var entryID uint32
		if err := binary.Read(r, binary.LittleEndian, &entryID); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			return h, records, fmt.Errorf("read entry id: %w", err)
		}
		if entryID == 0 {
			break
		}

		var dataLen uint32
		if err := binary.Read(r, binary.LittleEndian, &dataLen); err != nil {
			return h, records, fmt.Errorf("read data length for entry %d: %w", entryID, err)
		}

		data := make([]byte, dataLen)
		if _, err := io.ReadFull(r, data); err != nil {
			return h, records, fmt.Errorf("read data for entry %d (len %d): %w", entryID, dataLen, err)
		}

		records = append(records, Record{
			EntryID: entryID,
			Data:    data,
		})
	}

	return h, records, nil
}
