package api

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUserCode(t *testing.T) {
	t.Parallel()
	re := regexp.MustCompile(`^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$`)
	for i := 0; i < 50; i++ {
		code, err := newUserCode()
		require.NoError(t, err)
		require.Regexp(t, re, code)
	}
	require.Equal(t, "ABCD-2345", normalizeUserCode(" abcd2345 "))
}

func TestHashDeviceToken(t *testing.T) {
	t.Parallel()
	h := hashDeviceToken("chrdev_x")
	require.Len(t, h, 64)
	require.NotContains(t, h, "chrdev_x")
	require.Equal(t, h, hashDeviceToken("chrdev_x"))
}
