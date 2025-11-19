package merge_test

import (
	"bytes"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/golang/internal/testutil"
	"github.com/Emyrk/chronicle/golang/wowlogs/merge"
	"github.com/stretchr/testify/require"
)

func TestMerge(t *testing.T) {
	t.Parallel()

	logger := testutil.Logger(t)
	m := merge.NewMerger(logger)

	var out bytes.Buffer

	err := m.MergeLogs(
		strings.NewReader(formattedLog),
		strings.NewReader(rawLog),
		&out,
	)
	require.NoError(t, err)
}

const (
	formattedLog = `11/18 07:20:42.699  COMBATANT_GUID: 18.11.25 07:20:42&Maldrissa&0x00000000000EB167
11/18 07:20:42.699  COMBATANT_INFO: 18.11.25 07:20:42&Maldrissa&WARLOCK&Orc&3&Chotuk&Exalted with Doordash&Uber Eats&5&nil&nil&nil&nil&6266:0:96:0&nil&6568:0:237:0&4915:0:0:0&nil&nil&nil&nil&nil&nil&4695:0:0:0&4925:0:0:0&nil&11287:0:0:0&5976:0:0:0&0000000000000000000}000000000000000000}0505001100000000
11/18 07:20:42.731  CAST: Unknown casts LOGINEFFECT(836) on Unknown.
11/18 07:20:42.747  ZONE_INFO: 18.11.25 07:20:42&hillsbrad foothills&0
11/18 07:20:42.920  CAST: Unknown casts Blood Pact(7804)(Rank 2) on Unknown.
11/18 07:20:42.926  ZONE_INFO: 18.11.25 07:20:42&hillsbrad foothills&0
11/18 07:20:43.703  CAST: Mooshuggah casts Skinning(8618) on Gray Bear.
11/18 07:20:46.282  CAST: Mooshuggah casts Flame Shock(8052)(Rank 2) on Gray Bear.
11/18 07:20:49.561  CAST: Mooshuggah casts Lightning Strike(51387)(Rank 1) on Gray Bear.
11/18 07:20:49.561  CAST: Mooshuggah casts Flurry(16257)(Rank 1) on Mooshuggah.
11/18 07:20:51.658  CAST: Mooshuggah casts Flurry(16257)(Rank 1) on Mooshuggah.
11/18 07:20:56.842  CAST: Mooshuggah begins to cast Skinning(8618) on Gray Bear.
11/18 07:20:59.162  CAST: Irontooth begins to cast Hearthstone(8690).
11/18 07:20:59.674  CAST: Mooshuggah casts Skinning(8618) on Gray Bear.
11/18 07:21:00.810  CAST: Mooshuggah begins to cast Lesser Healing Wave(8004)(Rank 1) on Mooshuggah.
11/18 07:21:02.156  CAST: Mooshuggah casts Lesser Healing Wave(8004)(Rank 1) on Mooshuggah.`

	rawLog = `11/18 07:20:42.731  CAST: 0x00000000000EB167(Unknown) casts LOGINEFFECT(836) on 0x00000000000EB167(Unknown).
11/18 07:20:42.920  CAST: 0xF1400844930090A2(Unknown) casts Blood Pact(7804)(Rank 2) on 0xF1400844930090A2(Unknown).
11/18 07:20:43.703  CAST: 0x00000000000E8AB6(Mooshuggah) casts Skinning(8618) on 0xF13000092F003EE0(Gray Bear).
11/18 07:20:46.282  CAST: 0x00000000000E8AB6(Mooshuggah) casts Flame Shock(8052)(Rank 2) on 0xF13000092F00408E(Gray Bear).
11/18 07:20:49.561  CAST: 0x00000000000E8AB6(Mooshuggah) casts Lightning Strike(51387)(Rank 1) on 0xF13000092F00408E(Gray Bear).
11/18 07:20:49.561  CAST: 0x00000000000E8AB6(Mooshuggah) casts Flurry(16257)(Rank 1) on 0x00000000000E8AB6(Mooshuggah).
11/18 07:20:51.658  CAST: 0x00000000000E8AB6(Mooshuggah) casts Flurry(16257)(Rank 1) on 0x00000000000E8AB6(Mooshuggah).
11/18 07:20:56.842  CAST: 0x00000000000E8AB6(Mooshuggah) begins to cast Skinning(8618) on 0xF13000092F00408E(Gray Bear).
11/18 07:20:59.162  CAST: 0x00000000000F5F4B(Irontooth) begins to cast Hearthstone(8690).
11/18 07:20:59.674  CAST: 0x00000000000E8AB6(Mooshuggah) casts Skinning(8618) on 0xF13000092F00408E(Gray Bear).
11/18 07:21:00.810  CAST: 0x00000000000E8AB6(Mooshuggah) begins to cast Lesser Healing Wave(8004)(Rank 1) on 0x00000000000E8AB6(Mooshuggah).
11/18 07:21:02.156  CAST: 0x00000000000E8AB6(Mooshuggah) casts Lesser Healing Wave(8004)(Rank 1) on 0x00000000000E8AB6(Mooshuggah).`
)
