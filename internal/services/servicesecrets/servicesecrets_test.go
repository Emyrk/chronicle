package servicesecrets

import (
	"context"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestServiceStart(t *testing.T) {
	t.Parallel()

	t.Run("missing key disables cipher", func(t *testing.T) {
		t.Parallel()
		service := &Service{}
		require.NoError(t, service.Start(context.Background()))
		require.Nil(t, service.cipher)
	})

	t.Run("invalid key fails startup", func(t *testing.T) {
		t.Parallel()
		service := &Service{credentialKey: "not-base64"}
		require.ErrorContains(t, service.Start(context.Background()), "decode")
	})

	t.Run("valid key configures cipher", func(t *testing.T) {
		t.Parallel()
		service := &Service{credentialKey: base64.StdEncoding.EncodeToString(make([]byte, 32))}
		require.NoError(t, service.Start(context.Background()))
		require.NotNil(t, service.cipher)
		require.Equal(t, CredentialKeyID, service.cipher.KeyID())
	})
}

func TestServiceOptionUsesSharedCredentialEnvironmentVariable(t *testing.T) {
	t.Parallel()

	options := (&Service{}).Options()
	require.Len(t, options, 1)
	require.Equal(t, "CHRONICLE_CREDENTIAL_ENCRYPTION_KEY", options[0].Env)
}
