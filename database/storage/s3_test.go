package storage

import (
	"errors"
	"testing"

	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/require"
)

func TestIsS3FileNotFound(t *testing.T) {
	t.Parallel()

	for _, code := range []string{"NoSuchKey", "NotFound"} {
		t.Run(code, func(t *testing.T) {
			t.Parallel()
			err := &smithy.GenericAPIError{Code: code, Message: "missing"}
			require.True(t, isS3FileNotFound(err))
			require.True(t, isS3FileNotFound(errors.Join(errors.New("wrapped"), err)))
		})
	}

	require.False(t, isS3FileNotFound(&smithy.GenericAPIError{Code: "AccessDenied", Message: "denied"}))
}
