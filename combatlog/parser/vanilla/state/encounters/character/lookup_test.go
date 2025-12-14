package character_test

import (
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/character"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestCharacters(t *testing.T) {
	t.Parallel()

	t.Run("BasicActivity", func(t *testing.T) {
		cars := character.NewCharacters(unitdb.New())

		// 0xF1300010C7009C09(Scarlet Myrmidon)
		// 0x000000000001C7AC(Doyd)
		const logs = `
12/9 17:11:35.780  UNIT_INFO: 09.12.25 17:11:35&0x000000000001C7AC&1&Doyd&1&&,6774=1
12/9 17:11:35.780  UNIT_INFO: 09.12.25 17:11:35&0xF1300010C7009C09&0&Scarlet Myrmidon&0&&
12/9 17:11:41.572  UNIT_INFO: 09.12.25 17:11:41&0x000000000008CD28&1&Shamum&1&&
-- These logs are from earlier. The mob reset
12/9 17:11:41.572  0xF1300010C7009C09 hits 0x000000000008CD28 for 90.
12/9 17:11:43.247  0xF1300010C7009C09 misses 0x000000000008CD28.
12/9 17:11:43.445  0xF1300010C7009C09 crits 0x000000000008CD28 for 168.
12/9 17:11:45.020  0xF1300010C7009C09 hits 0x000000000008CD28 for 168.
12/9 17:11:45.251  0xF1300010C7009C09 hits 0x000000000008CD28 for 81.
-- Earlier logs end
12/9 17:13:05.838  CAST: 0x000000000001C7AC(Doyd) casts LOGINEFFECT(836) on 0x000000000001C7AC(Doyd).
12/9 17:13:10.985  UNIT_INFO: 09.12.25 17:13:10&0x000000000001C7AC&1&Doyd&1&&
12/9 17:13:10.985  0x000000000001C7AC hits 0xF1300010C7009C09 for 153.
12/9 17:13:11.018  0x000000000001C7AC hits 0xF1300010C7009C09 for 69.
12/9 17:13:11.117  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:11.546  CAST: 0x000000000001C7AC(Doyd) casts Sinister Strike(11294)(Rank 8) on 0xF1300010C7009C09(Scarlet Myrmidon).
12/9 17:13:11.546  0x000000000001C7AC's Sinister Strike hits 0xF1300010C7009C09 for 220.
12/9 17:13:11.942  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:12.503  0x000000000001C7AC hits 0xF1300010C7009C09 for 73.
12/9 17:13:12.602  CAST: 0x000000000001C7AC(Doyd) casts Sinister Strike(11294)(Rank 8) on 0xF1300010C7009C09(Scarlet Myrmidon).
12/9 17:13:12.602  0x000000000001C7AC's Sinister Strike crits 0xF1300010C7009C09 for 458.
12/9 17:13:12.602  CAST: 0x000000000001C7AC(Doyd) casts Hack and Slash(52634) on 0x000000000001C7AC(Doyd).
12/9 17:13:12.602  0x000000000001C7AC gains 1 extra attack through Hack and Slash.
12/9 17:13:12.602  0x000000000001C7AC hits 0xF1300010C7009C09 for 143.
12/9 17:13:12.866  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:13.757  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:13.955  0x000000000001C7AC hits 0xF1300010C7009C09 for 80.
12/9 17:13:14.681  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:14.747  0x000000000001C7AC hits 0xF1300010C7009C09 for 150.
12/9 17:13:15.440  0x000000000001C7AC hits 0xF1300010C7009C09 for 64.
12/9 17:13:15.605  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:16.529  0xF1300010C7009C09 hits 0x000000000001C7AC for 164.
12/9 17:13:16.925  0x000000000001C7AC crits 0xF1300010C7009C09 for 154.
12/9 17:13:16.959  0x000000000001C7AC hits 0xF1300010C7009C09 for 146.
12/9 17:13:17.420  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:18.344  0x000000000001C7AC hits 0xF1300010C7009C09 for 67.
12/9 17:13:18.344  0xF1300010C7009C09 hits 0x000000000001C7AC for 172.
12/9 17:13:19.202  0x000000000001C7AC hits 0xF1300010C7009C09 for 142.
12/9 17:13:19.235  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:19.796  0x000000000001C7AC crits 0xF1300010C7009C09 for 162.
12/9 17:13:20.159  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:21.051  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:21.215  0x000000000001C7AC hits 0xF1300010C7009C09 for 63.
12/9 17:13:21.414  0x000000000001C7AC hits 0xF1300010C7009C09 for 149.
12/9 17:13:22.007  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:22.700  0x000000000001C7AC hits 0xF1300010C7009C09 for 76.
12/9 17:13:22.931  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:23.657  0x000000000001C7AC hits 0xF1300010C7009C09 for 153.
12/9 17:13:23.821  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:24.119  0x000000000001C7AC hits 0xF1300010C7009C09 for 74.
12/9 17:13:24.779  0xF1300010C7009C09 attacks. 0x000000000001C7AC parries.
12/9 17:13:25.176  0x000000000001C7AC hits 0xF1300010C7009C09 for 77.
12/9 17:13:25.539  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:25.836  0x000000000001C7AC crits 0xF1300010C7009C09 for 304.
12/9 17:13:26.560  0x000000000001C7AC hits 0xF1300010C7009C09 for 66.
12/9 17:13:26.560  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:27.287  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:28.013  0x000000000001C7AC hits 0xF1300010C7009C09 for 74.
12/9 17:13:28.046  0x000000000001C7AC hits 0xF1300010C7009C09 for 141.
12/9 17:13:28.442  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:29.135  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:29.498  0x000000000001C7AC hits 0xF1300010C7009C09 for 75.
12/9 17:13:30.158  0xF1300010C7009C09 crits 0x000000000001C7AC for 164.
12/9 17:13:30.323  0x000000000001C7AC hits 0xF1300010C7009C09 for 150.
12/9 17:13:30.917  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:30.950  0x000000000001C7AC hits 0xF1300010C7009C09 for 81.
12/9 17:13:32.038  CAST: 0x000000000001C7AC(Doyd) casts Sinister Strike(11294)(Rank 8) on 0xF1300010C7009C09(Scarlet Myrmidon).
12/9 17:13:32.038  0x000000000001C7AC's Sinister Strike hits 0xF1300010C7009C09 for 224.
12/9 17:13:32.038  CAST: 0x000000000001C7AC(Doyd) casts Hack and Slash(52634) on 0x000000000001C7AC(Doyd).
12/9 17:13:32.038  0x000000000001C7AC gains 1 extra attack through Hack and Slash.
12/9 17:13:32.038  0x000000000001C7AC hits 0xF1300010C7009C09 for 146.
12/9 17:13:32.038  0xF1300010C7009C09 misses 0x000000000001C7AC.
12/9 17:13:32.370  0x000000000001C7AC hits 0xF1300010C7009C09 for 69.
12/9 17:13:32.370  CAST: 0xF1300010C7009C09(Scarlet Myrmidon) casts Enrage(8269) on 0xF1300010C7009C09(Scarlet Myrmidon).
12/9 17:13:32.370  0xF1300010C7009C09 gains Enrage (1).
12/9 17:13:32.765  0xF1300010C7009C09 attacks. 0x000000000001C7AC parries.
12/9 17:13:33.095  CAST: 0x000000000001C7AC(Doyd) casts Eviscerate(11300)(Rank 8) on 0xF1300010C7009C09(Scarlet Myrmidon).
12/9 17:13:33.095  0x000000000001C7AC's Eviscerate hits 0xF1300010C7009C09 for 614.
12/9 17:13:33.227  0x000000000001C7AC hits 0xF1300010C7009C09 for 67.
12/9 17:13:33.887  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:34.118  CAST: 0x000000000001C7AC(Doyd) casts Riposte(14251) on 0xF1300010C7009C09(Scarlet Myrmidon).
12/9 17:13:34.118  0x000000000001C7AC's Riposte crits 0xF1300010C7009C09 for 474.
12/9 17:13:34.118  0xF1300010C7009C09 is afflicted by Riposte (1).
12/9 17:13:34.150  0xF1300010C7009C09 attacks. 0x000000000001C7AC dodges.
12/9 17:13:34.184  0xF1300010C7009C09 is slain by 0x000000000001C7AC!
12/9 17:13:34.186  0xF1300010C7009C09 dies.
12/9 17:13:34.186  0x000000000001C7AC hits 0xF1300010C7009C09 for 135.`

		logger := testutil.Logger(t)
		parser, err := vanilla.New(logger, strings.NewReader(logs))
		require.NoError(t, err)

		for {
			msgs, err := parser.Advance()
			if errors.Is(err, io.EOF) {
				break
			}
			require.NoError(t, err)

			for _, m := range msgs {
				err = cars.Process(m)
				require.NoError(t, err)
			}
		}

		doydChar, ok := cars.All[0x000000000001C7AC] // Doyd
		require.True(t, ok, "expected to find Doyd in characters")
		doyd, ok := doydChar.(*character.Common)
		require.True(t, ok, "expected Doyd to be a Common character")

		myrmChar, ok := cars.All[0xF1300010C7009C09] // Scarlet Myrmidon
		require.True(t, ok, "expected to find Scarlet Myrmidon in characters")
		myrm, ok := myrmChar.(*character.Common)
		require.True(t, ok, "expected Scarlet Myrmidon to be a Common character")

		shamumChar, ok := cars.All[0x000000000008CD28] // Shamum
		require.True(t, ok, "expected to find Shamum in characters")
		shamum, ok := shamumChar.(*character.Common)
		require.True(t, ok, "expected Shamum to be a Common character")

		require.Len(t, cars.All, 3, "expected to find 3 characters in total")

		// Shamum :: Times out
		require.False(t, shamum.Activity.IsActive(), "shamum should not be active")
		require.Len(t, shamum.Activity.History, 1, "shamum has timed out period")
		require.Nil(t, shamum.LastSlain, "shamum should have no last slain message")
		cur, _ := shamum.Activity.Current()
		require.IsType(t, messages.Timeout{}, cur.End.Timestamp, "shamum should have timed out")
		require.NotEqual(t, cur.End.Timestamp, cur.LastActive, "timeout is not activity")

		// Myrmidon :: Timed out, then slain
		require.False(t, myrm.Activity.IsActive(), "scarlet myrmidon should not be active")
		require.Len(t, myrm.Activity.History, 2, "scarlet myrmidon should have 2 activity period, first was a timeout")
		require.NotNil(t, myrm.LastSlain, "scarlet myrmidon should have a last slain message")
		cur, _ = myrm.Activity.Current()

		slain, _ := cur.End.Timestamp.(messages.Slain)
		require.Equal(t, guid.GUID(0xF1300010C7009C09), slain.Victim)

		// Check the first period too
		require.IsType(t, messages.Timeout{}, myrm.Activity.History[0].End.Timestamp, "timed out first")

		// Doyd is still active.
		// TODO: Should we mark him inactive if he kills who he is attacking?
		//  Unsure, because we can use the mob inactivity to mark fight end.
		require.True(t, doyd.Activity.IsActive(), "doyd should be active")
		require.Len(t, doyd.Activity.History, 1, "doyd should have 1 activity period")
		require.Nil(t, doyd.LastSlain, "doyd should have no last slain message")
	})
}
