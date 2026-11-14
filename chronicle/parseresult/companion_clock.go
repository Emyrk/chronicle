package parseresult

import (
	"bufio"
	"bytes"
	"strings"

	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
)

// scanCompanionClock matches the legacy worker's extended header scan before
// parsing CLEU bytes. Without it, year and UTC offsets can differ by replica.
func scanCompanionClock(data []byte) *realmclock.Info {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Text()
		for i := 0; i < len(line)-3; i++ {
			if line[i] != '[' || line[i+1] < '0' || line[i+1] > '9' || line[i+2] != 'H' || line[i+3] != ':' {
				continue
			}
			payload := line[i+4:]
			end := strings.IndexByte(payload, ']')
			if end < 0 {
				break
			}
			clock, err := companion.ParseHeaderClock(payload[:end])
			if err == nil && clock != nil {
				return clock
			}
			break
		}
	}
	return nil
}
