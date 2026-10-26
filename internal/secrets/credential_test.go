package secrets

import (
	"bytes"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCredentialCipherRoundTrip(t *testing.T) {
	t.Parallel()

	cipher, err := NewCredentialCipher("v1", bytes.Repeat([]byte{1}, 32))
	require.NoError(t, err)

	plaintext := []byte("openrouter-secret")
	aad := []byte("user:provider")
	encrypted, err := cipher.Encrypt(plaintext, aad)
	require.NoError(t, err)
	require.NotContains(t, string(encrypted), string(plaintext))

	decrypted, err := cipher.Decrypt(encrypted, aad)
	require.NoError(t, err)
	require.Equal(t, plaintext, decrypted)
}

func TestCredentialCipherRejectsWrongKeyAndAAD(t *testing.T) {
	t.Parallel()

	first, err := NewCredentialCipher("v1", bytes.Repeat([]byte{1}, 32))
	require.NoError(t, err)
	sameIDWrongKey, err := NewCredentialCipher("v1", bytes.Repeat([]byte{2}, 32))
	require.NoError(t, err)
	wrongID, err := NewCredentialCipher("v2", bytes.Repeat([]byte{1}, 32))
	require.NoError(t, err)

	encrypted, err := first.Encrypt([]byte("secret"), []byte("correct"))
	require.NoError(t, err)

	_, err = sameIDWrongKey.Decrypt(encrypted, []byte("correct"))
	require.ErrorContains(t, err, "authentication failed")
	_, err = first.Decrypt(encrypted, []byte("wrong"))
	require.ErrorContains(t, err, "authentication failed")
	_, err = wrongID.Decrypt(encrypted, []byte("correct"))
	require.ErrorContains(t, err, "not available")
}

func TestCredentialCipherMalformedCiphertext(t *testing.T) {
	t.Parallel()

	cipher, err := NewCredentialCipher("v1", bytes.Repeat([]byte{1}, 32))
	require.NoError(t, err)

	for _, ciphertext := range [][]byte{
		nil,
		[]byte("bad"),
		{'X', 'X', credentialVersion, 12, 0, 2, 'v', '1'},
		{'C', 'C', 99, 12, 0, 2, 'v', '1'},
		{'C', 'C', credentialVersion, 12, 0, 20, 'v', '1'},
	} {
		_, err := cipher.Decrypt(ciphertext, nil)
		require.Error(t, err)
	}
}

func TestCredentialCipherNonceUniqueness(t *testing.T) {
	t.Parallel()

	cipher, err := NewCredentialCipher("v1", bytes.Repeat([]byte{1}, 32))
	require.NoError(t, err)

	first, err := cipher.Encrypt([]byte("same"), nil)
	require.NoError(t, err)
	second, err := cipher.Encrypt([]byte("same"), nil)
	require.NoError(t, err)
	require.NotEqual(t, first, second)

	_, firstNonce, _, err := parseCredentialEnvelope(first)
	require.NoError(t, err)
	_, secondNonce, _, err := parseCredentialEnvelope(second)
	require.NoError(t, err)
	require.NotEqual(t, firstNonce, secondNonce)
}

func TestNewCredentialCipherValidation(t *testing.T) {
	t.Parallel()

	_, err := NewCredentialCipher("", make([]byte, 32))
	require.ErrorContains(t, err, "key ID")
	_, err = NewCredentialCipher("v1", make([]byte, 31))
	require.ErrorContains(t, err, "32 bytes")
}

func TestNewCredentialCipherFromBase64(t *testing.T) {
	t.Parallel()

	_, err := NewCredentialCipherFromBase64("v1", "not-base64")
	require.ErrorContains(t, err, "decode")
	_, err = NewCredentialCipherFromBase64("v1", base64.StdEncoding.EncodeToString(make([]byte, 31)))
	require.ErrorContains(t, err, "32 bytes")
	cipher, err := NewCredentialCipherFromBase64("v1", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	require.NoError(t, err)
	require.NotNil(t, cipher)
	require.Equal(t, "v1", cipher.KeyID())
}

func TestUserCredentialAAD(t *testing.T) {
	t.Parallel()
	require.Equal(t, []byte("user-id:provider-credential"), UserCredentialAAD("user-id", "provider-credential"))
}
