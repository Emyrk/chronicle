// Package secrets provides encryption helpers for application credentials.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	credentialVersion byte = 1
	headerSize        int  = 4
)

var credentialMagic = [2]byte{'C', 'C'}

// CredentialCipher encrypts opaque credentials with AES-256-GCM.
//
// KeyID identifies the key version used for encryption. It is included in the
// ciphertext envelope, but the key itself never is.
type CredentialCipher struct {
	keyID string
	aead  cipher.AEAD
	rand  io.Reader
}

// NewCredentialCipher constructs a credential cipher from a non-empty key ID
// and an exactly 32-byte AES-256 key.
func NewCredentialCipher(keyID string, key []byte) (*CredentialCipher, error) {
	if keyID == "" {
		return nil, errors.New("credential key ID is required")
	}
	if len(keyID) > int(^uint16(0)) {
		return nil, errors.New("credential key ID is too long")
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("credential key must be 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create credential cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create credential GCM: %w", err)
	}
	return &CredentialCipher{keyID: keyID, aead: aead, rand: rand.Reader}, nil
}

// KeyID returns the key version identifier embedded in new ciphertexts.
func (c *CredentialCipher) KeyID() string { return c.keyID }

// Encrypt encrypts plaintext and authenticates associatedData. The returned
// envelope contains a format version, key ID, nonce, and ciphertext.
func (c *CredentialCipher) Encrypt(plaintext, associatedData []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(c.rand, nonce); err != nil {
		return nil, fmt.Errorf("generate credential nonce: %w", err)
	}

	keyID := []byte(c.keyID)
	header := make([]byte, headerSize, headerSize+2+len(keyID)+len(nonce))
	header[0], header[1] = credentialMagic[0], credentialMagic[1]
	header[2] = credentialVersion
	header[3] = byte(len(nonce))
	header = binary.BigEndian.AppendUint16(header, uint16(len(keyID)))
	header = append(header, keyID...)
	header = append(header, nonce...)

	authenticatedData := credentialAssociatedData(header, associatedData)
	return c.aead.Seal(header, nonce, plaintext, authenticatedData), nil
}

// Decrypt authenticates and decrypts a credential envelope. A cipher only
// decrypts envelopes whose embedded key ID matches its configured key ID.
func (c *CredentialCipher) Decrypt(ciphertext, associatedData []byte) ([]byte, error) {
	keyID, nonce, sealed, err := parseCredentialEnvelope(ciphertext)
	if err != nil {
		return nil, err
	}
	if keyID != c.keyID {
		return nil, fmt.Errorf("credential key ID %q is not available", keyID)
	}
	if len(nonce) != c.aead.NonceSize() {
		return nil, errors.New("credential ciphertext has invalid nonce size")
	}
	header := ciphertext[:len(ciphertext)-len(sealed)]
	plaintext, err := c.aead.Open(nil, nonce, sealed, credentialAssociatedData(header, associatedData))
	if err != nil {
		return nil, errors.New("decrypt credential: authentication failed")
	}
	return plaintext, nil
}

func credentialAssociatedData(header, associatedData []byte) []byte {
	combined := make([]byte, 0, len(header)+len(associatedData))
	combined = append(combined, header...)
	combined = append(combined, associatedData...)
	return combined
}

func parseCredentialEnvelope(envelope []byte) (keyID string, nonce, sealed []byte, err error) {
	if len(envelope) < headerSize+2 {
		return "", nil, nil, errors.New("credential ciphertext is truncated")
	}
	if envelope[0] != credentialMagic[0] || envelope[1] != credentialMagic[1] {
		return "", nil, nil, errors.New("credential ciphertext has invalid magic")
	}
	if envelope[2] != credentialVersion {
		return "", nil, nil, fmt.Errorf("credential ciphertext version %d is unsupported", envelope[2])
	}
	nonceLen := int(envelope[3])
	keyIDLen := int(binary.BigEndian.Uint16(envelope[4:6]))
	payloadOffset := headerSize + 2 + keyIDLen + nonceLen
	if keyIDLen == 0 || nonceLen == 0 || payloadOffset > len(envelope) {
		return "", nil, nil, errors.New("credential ciphertext has malformed header")
	}
	keyIDStart := headerSize + 2
	nonceStart := keyIDStart + keyIDLen
	return string(envelope[keyIDStart:nonceStart]), envelope[nonceStart:payloadOffset], envelope[payloadOffset:], nil
}

// NewCredentialCipherFromBase64 constructs a credential cipher from a
// base64-encoded 32-byte AES-256 key.
func NewCredentialCipherFromBase64(keyID, encodedKey string) (*CredentialCipher, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("decode credential encryption key: %w", err)
	}
	return NewCredentialCipher(keyID, key)
}

// UserCredentialAAD binds a ciphertext to the owning user and its purpose so
// it cannot be replayed into another user's row or another credential slot.
func UserCredentialAAD(userID, purpose string) []byte {
	return []byte(userID + ":" + purpose)
}
