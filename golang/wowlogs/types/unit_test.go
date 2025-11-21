package types_test

import (
  "testing"

  "github.com/Emyrk/chronicle/golang/wowlogs/types"
  "github.com/stretchr/testify/require"
)

func TestParseUnit(t *testing.T) {
  t.Parallel()

  cases := []struct {
    input    string
    expected types.Unit
    expErr   bool
  }{
    {
      input: "",
    },
    {
      input: "PlayerOne",
      expected: types.Unit{
        Name: "PlayerOne",
      },
    },
    {
      input: "0x0000000000000001(PlayerOne)",
      expected: types.Unit{
        Name: "PlayerOne",
        Gid:  0x0000000000000001,
      },
    },
    {
      input: "0x00000000000EB167(Maldrissa)",
      expected: types.Unit{
        Name: "Maldrissa",
        Gid:  0x00000000000EB167,
      },
    },
    {
      input:  "0x00000000000EB167(",
      expErr: true,
    },
    {
      input: "0x00000000000EB167",
      expected: types.Unit{
        Gid: 0x00000000000EB167,
      },
    },
    {
      input:  "0x00000000000EB167)test(",
      expErr: true,
    },
    {
      input:  "0x000000",
      expErr: true,
    },
  }

  for _, c := range cases {
    t.Run(c.input, func(t *testing.T) {
      t.Parallel()
      unit, err := types.ParseUnit(c.input)
      if c.expErr {
        require.Error(t, err)
        return
      }

      require.NoError(t, err)
      require.Equal(t, c.expected, unit)
    })
  }
}
