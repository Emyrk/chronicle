package database

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"

	"github.com/google/uuid"
)

func InstanceSlug(groupID uuid.UUID, instanceName string) string {
	return hashInstanceSlug(groupID.String() + instanceName)
}

// InstanceVariantSlug distinguishes instances with the same name in one log
// group while keeping the original InstanceSlug stable for existing URLs.
func InstanceVariantSlug(groupID uuid.UUID, instanceName, difficultyName string, maxPlayers int32) string {
	return hashInstanceSlug(fmt.Sprintf("%s\x00%s\x00%s\x00%d", groupID, instanceName, difficultyName, maxPlayers))
}

// InstanceOrdinalSlug is the final deterministic fallback for multiple instances
// that share a name, difficulty, and raid size within one parsed log group.
func InstanceOrdinalSlug(groupID uuid.UUID, instanceName, difficultyName string, maxPlayers int32, ordinal int) string {
	return hashInstanceSlug(fmt.Sprintf("%s\x00%s\x00%s\x00%d\x00%d", groupID, instanceName, difficultyName, maxPlayers, ordinal))
}

func hashInstanceSlug(value string) string {
	hash := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(hash[:12])
}
