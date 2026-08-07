package chronicle

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestScanCompanionHeaderClock(t *testing.T) {
	t.Parallel()

	data := []byte(`5/23 17:00:00.250  SPELL_CAST_FAILED,0x000000000008DCCC,"Rhyd",0x10511,0x0000000000000000,nil,0x80000000,26992,"Thorns",0x8,"[2H:0.1,Icecrown,enUS,3.3.5a,12340,0d31,1716508800,-420]"`)
	clock := scanCompanionHeaderClock(data)
	require.NotNil(t, clock)
	assert.Equal(t, time.Date(2024, 5, 23, 17, 0, 0, 0, time.UTC), clock.LocalTime)
	assert.Equal(t, time.Date(2024, 5, 24, 0, 0, 0, 0, time.UTC), clock.UTCTime)
	assert.Equal(t, 7*time.Hour, clock.Offset)
}

func TestScanCompanionHeaderClockSkipsLegacyAndMalformedHeaders(t *testing.T) {
	t.Parallel()

	data := []byte("5/23 17:00:00.000  EVENT,\"[1H:0.1,Icecrown,enUS,3.3.5a,12340,old1]\"\n" +
		"5/23 17:00:01.000  EVENT,\"[2H:0.1,Icecrown,enUS,3.3.5a,12340,bad1,not-an-epoch,-420]\"")
	assert.Nil(t, scanCompanionHeaderClock(data))
}

func TestScanRealmName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		logFormat database.LogFormat
		input     string
		expected  string
	}{
		// ── V1 SuperWoW ──────────────────────────────────────────────
		{
			name:      "v1/realm_info_with_timestamp",
			logFormat: database.LogFormat112aSuperwowAddon,
			input:     "2/11 12:30:48.404  REALM_INFO: 11.02.26 12:30:48&1.18.0&7234&Dec 19 2025&Nordanaar",
			expected:  "Nordanaar",
		},
		{
			name:      "v1/realm_info_no_timestamp",
			logFormat: database.LogFormat112aSuperwowAddon,
			input:     "REALM_INFO: 21.01.26 22:30:49&1.18.0&7234&Dec 19 2025&Ambershire",
			expected:  "Ambershire",
		},
		{
			name:      "v1/realm_info_after_other_lines",
			logFormat: database.LogFormat112aSuperwowAddon,
			input: `2/11 12:30:47.000  COMBAT_LOG_VERSION something
2/11 12:30:48.404  REALM_INFO: 11.02.26 12:30:48&1.18.0&7234&Dec 19 2025&Nordanaar`,
			expected: "Nordanaar",
		},
		{
			name:      "v1/no_realm_info",
			logFormat: database.LogFormat112aSuperwowAddon,
			input:     "2/11 12:30:48.404  SWING_DAMAGE some combat data",
			expected:  "",
		},

		// ── V2 CC Addon ──────────────────────────────────────────────
		{
			name:      "v2/header_line",
			logFormat: database.LogFormat112aCcAddon,
			input:     "0|HEADER|0x00000000005DBA66|Nordanaar|Caverns of Time|0.5|1.5||1771083771|1.18.0|7234|Dec 19 2025|24.02.26 23:29:11|24.02.26 21:29:11|40",
			expected:  "Nordanaar",
		},
		{
			name:      "v2/header_after_other_lines",
			logFormat: database.LogFormat112aCcAddon,
			input: `1234|SOME_EVENT|data
0|HEADER|0x0000000000432A74|Turtle Bay|Ragefire Chasm|0.5|1.5||1771083771|1.18.0|7234|Dec 19 2025|23.02.26 19:17:05|23.02.26 18:17:05|200`,
			expected: "Turtle Bay",
		},
		{
			name:      "v2/no_header",
			logFormat: database.LogFormat112aCcAddon,
			input:     "1234|DAMAGE|data|more",
			expected:  "",
		},

		// ── WoTLK companion ──────────────────────────────────────────
		{
			name:      "wotlk/companion_header",
			logFormat: database.LogFormat335aCcAddon,
			input:     `5/20 15:52:10.073  SPELL_CAST_FAILED,0x000000000008DCCC,"Rhyd",0x10511,0x0000000000000000,nil,0x80000000,26992,"Thorns",0x8,"[1Z:Hellfire Citadel: The Blood Furnace,party,1,5 Player,5,0,0,0,0,Stormwind Keep][2H:0.1,ChromieCraft,enUS,3.3.5,12340,0d31][3P0x000000000008DCCC;IRhyd,DRUID,NightElf,2,65]"`,
			expected:  "ChromieCraft",
		},
		{
			name:      "wotlk/companion_header_multiline_truncated",
			logFormat: database.LogFormat335aCcAddon,
			// Real logs truncate long companion payloads across lines.
			// The H: frame appears early and is always complete.
			input: `5/20 15:52:10.073  SPELL_CAST_FAILED,0x000000000008DCCC,"Rhyd",0x10511,0x0000000000000000,nil,0x80000000,26992,"Thorns",0x8,"[1Z:Hellfire Citadel: The Blood Furnace,party,1,5 Player,5,0,0,0,0,Stormwind Keep][2H:0.1,Icecrown,enUS,3.3.5,12340,0d31][3P0x000000000008DCCC;IRhyd,DRUID,NightElf,2,65][4P0x000000000008DCCC;G1.29940.0.0.0.0.0.0.65:2.25919.0.0.0.0.0.0.65:3.2
continuation line that doesn't have framing`,
			expected: "Icecrown",
		},
		{
			name:      "wotlk/companion_header_after_combat",
			logFormat: database.LogFormat335aCcAddon,
			input: `6/15 18:00:00.000  SWING_DAMAGE,0x01,0x02,100,1,0,0,0,nil,nil
5/20 15:52:10.073  SPELL_CAST_FAILED,0x01,"P",0x10511,0x0,0x0,nil,0x0,1,"S",0x0,"[1Z:Zone,mode,1,5P,5,0,0,0,0,Keep][2H:0.1,Nordanaar,enUS,3.3.5,12340,abc1]"`,
			expected: "Nordanaar",
		},
		{
			name:      "wotlk/no_companion",
			logFormat: database.LogFormat335aCcAddon,
			input:     `6/15 18:00:00.000  SWING_DAMAGE,0x01,0x02,100,1,0,0,0,nil,nil`,
			expected:  "",
		},

		// ── AzerothCore server-side ──────────────────────────────────
		{
			name:      "azerothcore/chronicle_header_with_realm",
			logFormat: database.LogFormatAzerothcoreMod,
			input:     `1777340510851  CHRONICLE_HEADER,"Icecrown","3.3.5a",12340`,
			expected:  "Icecrown",
		},
		{
			name:      "azerothcore/chronicle_header_empty_realm",
			logFormat: database.LogFormatAzerothcoreMod,
			input:     `1777340510851  CHRONICLE_HEADER,"","3.3.5a",12340`,
			expected:  "",
		},
		{
			name:      "azerothcore/no_header",
			logFormat: database.LogFormatAzerothcoreMod,
			input:     `1777340510851  SWING_DAMAGE,0x01,0x02,100`,
			expected:  "",
		},

		// ── Unknown format ───────────────────────────────────────────
		{
			name:      "unknown_format",
			logFormat: "nonexistent-format",
			input:     "REALM_INFO: 21.01.26 22:30:49&1.18.0&7234&Dec 19 2025&Ambershire",
			expected:  "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result := scanRealmName(tc.logFormat, []byte(tc.input))
			assert.Equal(t, tc.expected, result)
		})
	}
}
