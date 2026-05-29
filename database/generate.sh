#!/usr/bin/env bash

# This script turns many *.sql.go files into a single queries.sql.go file. This
# is due to sqlc's behavior when using multiple sql files to output them to
# multiple Go files. We decided it would be cleaner to move these to a single
# file for readability. We should probably contribute the option to do this
# upstream instead, because this is quite janky.

set -euo pipefail

SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

(
	cd "$SCRIPT_DIR"

	echo generate 1>&2

	# Dump the updated schema (use make to utilize caching).
	make -C .. --no-print-directory database/dump.sql
	# The logic below depends on the exact version being correct :(
	sqlc generate

	first=true
	for fi in genqueries/*.sql.go; do
		# Find the last line from the imports section and add 1. We have to
		# disable pipefail temporarily to avoid ERRPIPE errors when piping into
		# `head -n1`.
		set +o pipefail
		cut=$(grep -n ')' "$fi" | head -n 1 | cut -d: -f1)
		set -o pipefail
		cut=$((cut + 1))

		# Copy the header from the first file only, ignoring the source comment.
		if $first; then
			head -n 6 <"$fi" | grep -v "source" >queries.sql.go
			first=false
		fi

		# Append the file past the imports section into queries.sql.go.
		tail -n "+$cut" <"$fi" >>queries.sql.go
		echo "$fi"
	done



	# Move the files we want.
	mv genqueries/querier.go .
	mv genqueries/models.go .
	mv genqueries/batch.go .

	# Remove temporary go files.
	rm -f genqueries/*.go
	rm -r genqueries

	# Fix struct/interface names.
	gofmt -w -r 'Querier -> sqlcQuerier' -- *.go
	gofmt -w -r 'Queries -> sqlQuerier' -- *.go

	# Ensure correct imports exist. Modules must all be downloaded so we get correct
	# suggestions.
	go mod download
	go run golang.org/x/tools/cmd/goimports@latest -w queries.sql.go

	# Dataset queries — separate package, no merge needed.
	# sqlc generates directly into datasetdb/.
	# Rename the interface for clarity.
	if [ -d "datasetdb" ]; then
		gofmt -w -r 'Querier -> Store' -- datasetdb/*.go
		gofmt -w -r 'Queries -> querier' -- datasetdb/*.go
		goimports -w datasetdb/
	fi

	# Generate enums (e.g. unique constraints).
#	go run gen/enum/main.go
)
