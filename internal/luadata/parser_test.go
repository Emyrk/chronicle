package luadata

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseTableLiterals(t *testing.T) {
	t.Parallel()
	value, err := ParseTable(t.Context(), `-- header
 { label = "名字", ["quoted"] = 'a\"b\\c\065',
 [1] = false, ["1"] = "string key", [-2] = 1.5e-3;
 nested = {true, false, nil, "_", ""}, -- line comment
 --[[ block comment ]]
 } -- tail`)
	require.NoError(t, err)
	require.Equal(t, Table, value.Kind)
	require.Equal(t, "名字", value.Fields["label"].Text)
	require.Equal(t, "a\"b\\cA", value.Fields["quoted"].Text)
	require.Equal(t, Value{Kind: Bool}, value.NumericFields["1"])
	require.Equal(t, "string key", value.Fields["1"].Text)
	require.Equal(t, "1.5e-3", value.NumericFields["-2"].Text)
	require.Equal(t, []Value{{Kind: Bool, Boolean: true}, {Kind: Bool}, {Kind: Nil}, {Kind: String, Text: "_"}, {Kind: String}}, value.Fields["nested"].Array)
}

func TestParseTableRejectsNonData(t *testing.T) {
	t.Parallel()
	for _, input := range []string{
		`os.execute("bad")`, `{run()}`, `{x = function() end}`, `{x = os.time()}`,
		`{x = foo}`, `{x = 1 + 2}`, `{x = "a" .. "b"}`, `setmetatable({}, {})`,
		`{}; run()`, `DB = {}`, `{} {}`, `{[true] = 1}`, `{[{}] = 1}`,
		`{x = 1, x = 2}`, `{[1] = 1, [1] = 2}`, `{`, ``, `nil`, `"text"`,
		`{"bad\999"}`, `{"bad\q"}`, `{"unfinished}`, `--[[ unfinished`,
		`{["x" = 1}`, `{x = 1 y = 2}`, `{x = 1e+}`, `{-}`, "{\"line\nbreak\"}",
	} {
		t.Run(input, func(t *testing.T) {
			t.Parallel()
			_, err := ParseTable(t.Context(), input)
			require.Error(t, err)
		})
	}
}

func TestParserAssignments(t *testing.T) {
	t.Parallel()
	p, err := NewParser(t.Context(), "First = {1};\r\nSecond = {2}; -- end")
	require.NoError(t, err)
	for _, name := range []string{"First", "Second"} {
		got, value, err := p.NextAssignment()
		require.NoError(t, err)
		require.Equal(t, name, got)
		require.Equal(t, Table, value.Kind)
	}
	_, _, err = p.NextAssignment()
	require.ErrorIs(t, err, io.EOF)
}

func TestParserLimits(t *testing.T) {
	t.Parallel()
	t.Run("input", func(t *testing.T) {
		t.Parallel()
		_, err := ParseTable(t.Context(), strings.Repeat(" ", MaxInputBytes+1))
		require.ErrorContains(t, err, "exceeds")
	})
	t.Run("depth", func(t *testing.T) {
		t.Parallel()
		_, err := ParseTable(t.Context(), strings.Repeat("{", MaxDepth)+strings.Repeat("}", MaxDepth))
		require.NoError(t, err)
		_, err = ParseTable(t.Context(), strings.Repeat("{", MaxDepth+1)+strings.Repeat("}", MaxDepth+1))
		require.ErrorContains(t, err, "nesting")
	})
	t.Run("entries", func(t *testing.T) {
		t.Parallel()
		_, err := ParseTable(t.Context(), "{"+strings.Repeat("0,", MaxEntries+1)+"}")
		require.ErrorContains(t, err, "entry limit")
	})
	t.Run("entries span assignments", func(t *testing.T) {
		t.Parallel()
		p, err := NewParser(t.Context(), "A={"+strings.Repeat("0,", MaxEntries)+"}; B={1}")
		require.NoError(t, err)
		_, _, err = p.NextAssignment()
		require.NoError(t, err)
		_, _, err = p.NextAssignment()
		require.ErrorContains(t, err, "entry limit")
	})
	t.Run("canceled", func(t *testing.T) {
		t.Parallel()
		ctx, cancel := context.WithCancel(t.Context())
		p, err := NewParser(ctx, "{}")
		require.NoError(t, err)
		cancel()
		_, _, err = p.NextAssignment()
		require.ErrorIs(t, err, context.Canceled)
		_, err = ParseTable(ctx, "{}")
		require.ErrorIs(t, err, context.Canceled)
	})
}

func FuzzParseTable(f *testing.F) {
	for _, input := range []string{`{}`, `{x = {false, "_", 1}}`, `{"\255"}`, `{}()`, `--[[comment]] {}`} {
		f.Add(input)
	}
	f.Fuzz(func(t *testing.T, input string) {
		_, _ = ParseTable(t.Context(), input)
	})
}
