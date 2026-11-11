package vanilla

import (
	"context"
	"errors"
	"io"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
)

// Source is a file-local pull adapter. Retain Decoder, not Source, when starting
// another file. It applies no clock transition or synthetic processing itself.
type Source struct {
	reader  *common.FileReader
	decoder *Decoder
	fatal   error
}

func NewSource(input io.Reader, maxLineBytes int, decoder *Decoder) (*Source, error) {
	if decoder == nil {
		return nil, errors.New("decoder is required")
	}
	reader, err := common.NewFileReader(input, maxLineBytes)
	if err != nil {
		return nil, err
	}
	return &Source{reader: reader, decoder: decoder}, nil
}

func (s *Source) Advance(ctx context.Context) ([]messages.Message, error) {
	if s.fatal != nil {
		return nil, s.fatal
	}
	line, err := s.reader.Next(ctx)
	if err == io.EOF {
		return nil, io.EOF
	}
	if err != nil {
		// Existing consumers log/recover ordinary decode errors. Source failure must
		// instead abort the parse, never masquerade as successful EOF.
		s.fatal = parseerrors.AsFatalError(err)
		return nil, s.fatal
	}
	content := strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r")
	batch, err := s.decoder.DecodeRecord(ctx, content)
	if parseerrors.IsFatalError(err) {
		s.fatal = err
	}
	return batch, err
}

// Summary certifies source ingestion only, not terminal combat finalization.
// Recoverable malformed records may have been reported along the way.
func (s *Source) Summary() common.FileSummary {
	if s.fatal != nil {
		return common.FileSummary{}
	}
	return s.reader.Summary()
}
