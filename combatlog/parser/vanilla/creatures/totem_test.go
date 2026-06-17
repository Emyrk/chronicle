package creatures_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/lines"
	"github.com/Emyrk/chronicle/combatlog/parser/merge"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestTotemicRecall(t *testing.T) {
	t.Parallel()

	logs := `12/11 12:40:00.000 UNIT_INFO: 11.12.25 12:21:12&0x000000000001C80A&1&Priests&1&&,10952=20,21850=1,20906=1,21562=1,10157=1
12/11 12:40:06.593  CAST: 0x00000000000C270C(Noflex) casts Mana Spring Totem(10497)(Rank 4).
12/11 12:40:06.593  CAST: 0xF130001CF827939E(Mana Spring Totem IV) casts Mana Spring(10494)(Rank 4) on 0xF130001CF827939E(Mana Spring Totem IV).
12/11 12:40:06.593  0x00000000000C270C casts Mana Spring Totem.
12/11 12:40:06.593  UNIT_INFO: 11.12.25 12:40:06&0xF130001CF827939E&0&Mana Spring Totem IV&1&0x00000000000C270C&,10494=1`

	logger := testutil.Logger(t)
	liner := lines.NewLiner()
	p := vanilla.NewFromScanner(context.Background(), logger, liner, merge.FromIOReader(liner, strings.NewReader(logs)), nil)

	db := unitdb.New()
	c := characters.NewCharacters(db, creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))
	for {
		msgs, err := p.Advance(context.Background())
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(t, err)
		for _, msg := range msgs {
			_, err := c.Process(msg)
			require.NoError(t, err)
		}
	}
}
