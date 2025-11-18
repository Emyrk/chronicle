package guid

import "testing"

func TestGUID_GetHigh(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want uint16
	}{
		{
			name: "player GUID",
			guid: 0x0000000000000001,
			want: 0x0000,
		},
		{
			name: "creature GUID",
			guid: 0x0030000000000001,
			want: 0x0030,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.GetHigh(); got != tt.want {
				t.Errorf("GetHigh() = 0x%04X, want 0x%04X", got, tt.want)
			}
		})
	}
}

func TestGUID_IsPlayer(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want bool
	}{
		{"player", 0x0000000000000001, true},
		{"creature", 0x0030000000000001, false},
		{"pet", 0x0040000000000001, false},
		{"vehicle", 0x0050000000000001, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.IsPlayer(); got != tt.want {
				t.Errorf("IsPlayer() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGUID_IsPet(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want bool
	}{
		{"player", 0x0000000000000001, false},
		{"creature", 0x0030000000000001, false},
		{"pet", 0x0040000000000001, true},
		{"vehicle", 0x0050000000000001, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.IsPet(); got != tt.want {
				t.Errorf("IsPet() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGUID_IsCreature(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want bool
	}{
		{"player", 0x0000000000000001, false},
		{"creature", 0x0030000000000001, true},
		{"pet", 0x0040000000000001, false},
		{"vehicle", 0x0050000000000001, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.IsCreature(); got != tt.want {
				t.Errorf("IsCreature() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGUID_IsVehicle(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want bool
	}{
		{"player", 0x0000000000000001, false},
		{"creature", 0x0030000000000001, false},
		{"pet", 0x0040000000000001, false},
		{"vehicle", 0x0050000000000001, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.IsVehicle(); got != tt.want {
				t.Errorf("IsVehicle() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGUID_IsAnyCreature(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want bool
	}{
		{"player", 0x0000000000000001, false},
		{"creature", 0x0030000000000001, true},
		{"pet", 0x0040000000000001, true},
		{"vehicle", 0x0050000000000001, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.IsAnyCreature(); got != tt.want {
				t.Errorf("IsAnyCreature() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGUID_IsUnit(t *testing.T) {
	tests := []struct {
		name string
		guid GUID
		want bool
	}{
		{"player", 0x0000000000000001, true},
		{"creature", 0x0030000000000001, true},
		{"pet", 0x0040000000000001, true},
		{"vehicle", 0x0050000000000001, true},
		{"gameobject", 0x0060000000000001, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.guid.IsUnit(); got != tt.want {
				t.Errorf("IsUnit() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGUID_GetEntry(t *testing.T) {
	tests := []struct {
		name      string
		guid      GUID
		wantEntry uint32
		wantOk    bool
	}{
		{
			name:      "player has no entry",
			guid:      0x0000000000000001,
			wantEntry: 0,
			wantOk:    false,
		},
		{
			name:      "creature with entry 12345",
			guid:      0x0030003039000001, // High: 0x0030 (16 bits), Entry: 0x003039 (24 bits), Counter: 0x000001 (24 bits)
			wantEntry: 12345,
			wantOk:    true,
		},
		{
			name:      "pet with entry 999",
			guid:      0x00400003E7000001, // High: 0x0040 (16 bits), Entry: 0x0003E7 (24 bits), Counter: 0x000001 (24 bits)
			wantEntry: 999,
			wantOk:    true,
		},
		{
			name:      "vehicle with entry 54321",
			guid:      0x005000D431000001, // High: 0x0050 (16 bits), Entry: 0x00D431 (24 bits), Counter: 0x000001 (24 bits)
			wantEntry: 54321,
			wantOk:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotEntry, gotOk := tt.guid.GetEntry()
			if gotEntry != tt.wantEntry {
				t.Errorf("GetEntry() entry = %v, want %v", gotEntry, tt.wantEntry)
			}
			if gotOk != tt.wantOk {
				t.Errorf("GetEntry() ok = %v, want %v", gotOk, tt.wantOk)
			}
		})
	}
}
