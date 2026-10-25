package messagesource_test

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/messagesource"
	"github.com/stretchr/testify/require"
)

type sourceResult struct {
	messages []messages.Message
	err      error
}
type batchSource struct {
	results []sourceResult
	index   int
}

func (s *batchSource) Advance(context.Context) ([]messages.Message, error) {
	if s.index >= len(s.results) {
		return nil, io.EOF
	}
	r := s.results[s.index]
	s.index++
	return r.messages, r.err
}

func msg(second int, reason string) messages.Message {
	return &messages.SkippedMessage{MessageBase: messages.Base(time.Unix(int64(second), 0)), Reason: reason}
}

func collect(t *testing.T, source messagesource.MessageSource) []string {
	t.Helper()
	var result []string
	for {
		batch, err := source.Advance(context.Background())
		for _, message := range batch {
			result = append(result, message.(*messages.SkippedMessage).Reason)
		}
		if err == io.EOF {
			return result
		}
		require.NoError(t, err)
	}
}

func TestInserterOrdering(t *testing.T) {
	t.Parallel()
	original := &batchSource{results: []sourceResult{{messages: []messages.Message{msg(1, "o1"), msg(3, "o3a"), msg(3, "o3b"), msg(5, "o5")}}, {err: io.EOF}}}
	inserted := &batchSource{results: []sourceResult{{messages: []messages.Message{msg(0, "i0"), msg(3, "i3a"), msg(3, "i3b"), msg(4, "i4"), msg(6, "i6")}, err: io.EOF}}}
	require.Equal(t, []string{"i0", "o1", "o3a", "o3b", "i3a", "i3b", "i4", "o5", "i6"}, collect(t, messagesource.NewInserter(original, inserted)))
}

func TestInserterBatchedAdvanceAndEOF(t *testing.T) {
	t.Parallel()
	original := &batchSource{results: []sourceResult{{}, {messages: []messages.Message{msg(2, "o2")}}, {messages: []messages.Message{msg(4, "o4")}, err: io.EOF}}}
	inserted := &batchSource{results: []sourceResult{{messages: []messages.Message{msg(1, "i1")}}, {}, {messages: []messages.Message{msg(3, "i3"), msg(5, "i5")}}, {err: io.EOF}}}
	require.Equal(t, []string{"i1", "o2", "i3", "o4", "i5"}, collect(t, messagesource.NewInserter(original, inserted)))
}

func TestInserterTimestampRegression(t *testing.T) {
	t.Parallel()
	original := &batchSource{results: []sourceResult{{messages: []messages.Message{msg(2, "o2")}}, {messages: []messages.Message{msg(1, "o1")}}}}
	inserted := &batchSource{results: []sourceResult{{err: io.EOF}}}
	source := messagesource.NewInserter(original, inserted)
	_, err := source.Advance(context.Background())
	require.NoError(t, err)
	_, err = source.Advance(context.Background())
	require.ErrorContains(t, err, "original source timestamp regression")
}

func TestInserterInsertedTimestampRegression(t *testing.T) {
	t.Parallel()
	original := &batchSource{results: []sourceResult{{messages: []messages.Message{msg(10, "o10")}, err: io.EOF}}}
	inserted := &batchSource{results: []sourceResult{{messages: []messages.Message{msg(2, "i2")}}, {messages: []messages.Message{msg(1, "i1")}}}}
	source := messagesource.NewInserter(original, inserted)
	_, err := source.Advance(context.Background())
	require.NoError(t, err)
	_, err = source.Advance(context.Background())
	require.ErrorContains(t, err, "inserted source timestamp regression")
}

func TestInserterCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := messagesource.NewInserter(&batchSource{}, &batchSource{}).Advance(ctx)
	require.ErrorIs(t, err, context.Canceled)
}
