package chronauth

import (
	"bytes"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

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

func TestGenerateAPIKey(t *testing.T) {
	t.Parallel()

	first, firstHash, err := GenerateAPIKey()
	require.NoError(t, err)
	second, secondHash, err := GenerateAPIKey()
	require.NoError(t, err)

	require.True(t, strings.HasPrefix(first, APIKeyPrefix))
	require.NotEqual(t, first, second)
	require.Len(t, firstHash, 32)
	require.True(t, bytes.Equal(firstHash, HashAPIKey(first)))
	require.False(t, bytes.Equal(firstHash, secondHash))
}

func TestAPIKeyLimiter(t *testing.T) {
	t.Parallel()

	keyID := uuid.New()
	limiter := newAPIKeyLimiter(APIKeyOptions{RequestsPerMinute: 60, Burst: 2})
	require.True(t, limiter.allow(keyID))
	require.True(t, limiter.allow(keyID))
	require.False(t, limiter.allow(keyID))
	require.True(t, limiter.allow(uuid.New()), "limits should be isolated per token")

	require.True(t, newAPIKeyLimiter(APIKeyOptions{}).allow(keyID), "zero values disable rate limiting")
}

func TestAPIKeysAreReadOnly(t *testing.T) {
	t.Parallel()

	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		require.True(t, isReadOnlyMethod(method), method)
	}
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		require.False(t, isReadOnlyMethod(method), method)
	}
}
