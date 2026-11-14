package parseresult

import (
	"testing"
	"time"
)

func TestScanCompanionClock(t *testing.T) {
	t.Parallel()
	data := []byte("5/23 17:00:00.250  SPELL_CAST_FAILED,\"[2H:0.1,Icecrown,enUS,3.3.5a,12340,0d31,1716508800,-420]\"")
	clock := scanCompanionClock(data)
	if clock == nil || !clock.LocalTime.Equal(time.Date(2024, 5, 23, 17, 0, 0, 0, time.UTC)) ||
		!clock.UTCTime.Equal(time.Date(2024, 5, 24, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("extended header clock: %+v", clock)
	}
	if scanCompanionClock([]byte("5/23 17:00:00.250  SPELL_CAST_FAILED,\"[1H:0.1,Icecrown,enUS,3.3.5a,12340,old1]\"")) != nil {
		t.Fatal("invalid clock accepted")
	}
}
