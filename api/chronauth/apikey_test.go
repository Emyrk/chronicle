package chronauth

import "testing"

func TestValidateVersion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		version string
		wantErr bool
	}{
		{name: "empty accepted", version: "", wantErr: false},
		{name: "unknown accepted", version: "unknown", wantErr: false},
		{name: "below minimum rejected", version: "0.0.259", wantErr: true},
		{name: "minimum accepted", version: "0.0.260", wantErr: false},
		{name: "minor accepted", version: "0.1.0", wantErr: false},
		{name: "major accepted", version: "1.0.0", wantErr: false},
		{name: "v-prefixed minimum accepted", version: "v0.0.260", wantErr: false},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			err := validateVersion(&tc.version)
			if tc.wantErr && err == nil {
				t.Fatalf("validateVersion(%q) expected error, got nil", tc.version)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("validateVersion(%q) expected nil error, got %v", tc.version, err)
			}
		})
	}
}
