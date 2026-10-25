// Package messagesource defines composable sources of parsed combat-log messages.
package messagesource

import (
	"context"
	"io"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
)

// MessageSource produces parsed messages in source order.
type MessageSource interface {
	Advance(context.Context) ([]messages.Message, error)
}

// Decoder builds a message source from an artifact reader.
type Decoder interface {
	Decode(context.Context, io.Reader) (MessageSource, error)
}
