package serviceazerothcore

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeRealmAliases(t *testing.T) {
	t.Parallel()

	assert.Equal(t,
		[]string{"普通-US", "Normal-CN"},
		normalizeRealmAliases("Normal-US", []string{" 普通-US ", "normal-us", "", "Normal-CN", "normal-cn"}),
	)
	assert.Empty(t, normalizeRealmAliases("Normal-US", nil))
}
