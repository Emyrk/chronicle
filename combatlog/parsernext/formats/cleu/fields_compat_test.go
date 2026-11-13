package cleu_test

import (
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/stretchr/testify/require"
)

// Matched remains the original legacy typed cursor; unlike legacy semantic
// handlers it does not delegate typed conversion to Fields.
func TestFieldsOriginalMatchedCompatibility(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		values []string
		read   func(cleu.Cursor) any
	}{
		{"int32", []string{"nil", "", "0", "-2147483648", "2147483647", "2147483648", "-2147483649", "0x1", "bad"}, func(m cleu.Cursor) any { return m.Int32() }},
		{"int64", []string{"nil", "", "-9223372036854775808", "9223372036854775807", "9223372036854775808", "-9223372036854775809", "bad"}, func(m cleu.Cursor) any { return m.Int64() }},
		{"uint32", []string{"nil", "", "0", "4294967295", "4294967296", "-1", "bad"}, func(m cleu.Cursor) any { return m.Uint32() }},
		{"hex", []string{"nil", "", "0x0", "0xffffffff", "100000000", "0X2", "bad-hex"}, func(m cleu.Cursor) any { return m.HexUint32() }},
		{"school", []string{"nil", "", "0x2", "0X40", "64", "65535", "65536", "0x10000", "-1", "bad"}, func(m cleu.Cursor) any { return m.School() }},
		{"guid", []string{"nil", "", "0x0000000000000000", "0x0000000000000001", "0xF130008142000001", "invalid"}, func(m cleu.Cursor) any { return m.Guid() }},
		{"optional guid", []string{"nil", "", "0x0000000000000000", "0x0000000000000001", "0xF130008142000001", "invalid"}, func(m cleu.Cursor) any { return m.OptionalGuid() }},
		{"bool", []string{"nil", "", "0", "1", "true", "false", "arbitrary"}, func(m cleu.Cursor) any { return m.NilBool() }},
		{"string", []string{"nil", "", "value"}, func(m cleu.Cursor) any { return m.String() }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			for _, raw := range tc.values {
				_, _, original, err := wotlk.ParseLineUnixMillis("123  EVENT," + raw + ",tail,bad")
				require.NoError(t, err)
				fields := cleu.NewFields([]string{raw, "tail", "bad"})
				compare := func(read func(cleu.Cursor) any) {
					t.Helper()
					want := read(original)
					got := read(fields)
					require.Equal(t, want, got, "raw %q", raw)
					require.Equal(t, original.Remain(), fields.Remain())
					if original.Error() == nil {
						require.NoError(t, fields.Error())
					} else {
						require.EqualError(t, fields.Error(), original.Error().Error())
					}
				}
				compare(tc.read)
				// Successful reads and later failures still consume fields, while the first
				// error is sticky. Exhaustion never advances either cursor.
				compare(func(m cleu.Cursor) any { return m.String() })
				compare(func(m cleu.Cursor) any { return m.Int32() })
				compare(tc.read)
				compare(func(m cleu.Cursor) any { return m.String() })
			}
		})
	}
}

func TestFieldsExhaustionWithoutPriorError(t *testing.T) {
	t.Parallel()
	for _, read := range []func(cleu.Cursor) any{
		func(m cleu.Cursor) any { return m.Int32() },
		func(m cleu.Cursor) any { return m.Guid() },
		func(m cleu.Cursor) any { return m.OptionalGuid() },
		func(m cleu.Cursor) any { return m.String() },
	} {
		_, _, original, err := wotlk.ParseLineUnixMillis("123  EVENT")
		require.NoError(t, err)
		fields := cleu.NewFields(nil)
		require.Equal(t, read(original), read(fields))
		require.EqualError(t, fields.Error(), original.Error().Error())
		require.True(t, strings.Contains(fields.Error().Error(), "field index 0 out of range"))
		require.Zero(t, fields.Remain())
	}
}
