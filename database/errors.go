package database

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

func IsSerializedError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "serialization_failure"
	}
	return false
}

// IsUniqueViolation checks if the error is due to a unique violation.
// If one or more specific unique constraints are given as arguments,
// the error must be caused by one of them. If no constraints are given,
// this function returns true for any unique violation.
func IsUniqueViolation(err error, uniqueConstraints ...UniqueConstraint) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" {
			if len(uniqueConstraints) == 0 {
				return true
			}
			for _, uc := range uniqueConstraints {
				if pgErr.ConstraintName == string(uc) {
					return true
				}
			}
		}
	}

	return false
}

// IsForeignKeyViolation checks if the error is due to a foreign key violation.
// If one or more specific foreign key constraints are given as arguments,
// the error must be caused by one of them. If no constraints are given,
// this function returns true for any foreign key violation.
func IsForeignKeyViolation(err error, foreignKeyConstraints ...ForeignKeyConstraint) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23503" {
			if len(foreignKeyConstraints) == 0 {
				return true
			}
			for _, fc := range foreignKeyConstraints {
				if pgErr.ConstraintName == string(fc) {
					return true
				}
			}
		}
	}

	return false
}

// IsCheckViolation checks if the error is due to a check violation. If one or
// more specific check constraints are given as arguments, the error must be
// caused by one of them. If no constraints are given, this function returns
// true for any check violation.
func IsCheckViolation(err error, checkConstraints ...CheckConstraint) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23514" {
			if len(checkConstraints) == 0 {
				return true
			}
			for _, cc := range checkConstraints {
				if pgErr.ConstraintName == string(cc) {
					return true
				}
			}
		}
	}

	return false
}

// IsQueryCanceledError checks if the error is due to a query being canceled.
func IsQueryCanceledError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "57014" // query_canceled
	} else if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	return false
}

// IsRLSViolation checks if the error is due to a row-level security policy violation.
func IsRLSViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "42501" // insufficient_privilege (RLS)
	}
	return false
}
