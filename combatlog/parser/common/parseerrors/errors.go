package parseerrors

import "errors"

type FatalError struct {
	error
}

func (f FatalError) Error() string {
	return f.error.Error()
}

func (f FatalError) Unwrap() error {
	return f.error
}

func IsFatalError(err error) bool {
	var fatal FatalError
	ok := errors.As(err, &fatal)
	return ok
}

func AsFatalError(err error) FatalError {
	return FatalError{
		error: err,
	}
}
