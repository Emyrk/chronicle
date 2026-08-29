#!/usr/bin/env bash
#
# Unit tests for fetch-fixtures.sh slug normalization and validation.
# Runs without network access — tests only the normalize_slug function.
#
# Usage: bash scripts/fetch-fixtures/fetch-fixtures_test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source normalize_slug and helpers from the main script.
# We extract the function definitions without running the main logic.
source <(sed -n '/^SLUG_PATTERN=/p; /^normalize_slug()/,/^}/p; /^die()/,/^}/p' "$SCRIPT_DIR/fetch-fixtures.sh")

pass=0
fail=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  ✓ $desc"
    pass=$((pass + 1))
  else
    echo "  ✗ $desc: expected '$expected', got '$actual'"
    fail=$((fail + 1))
  fi
}

assert_fails() {
  local desc="$1" input="$2"
  if result=$(normalize_slug "$input" 2>/dev/null); then
    echo "  ✗ $desc: expected failure, got '$result'"
    fail=$((fail + 1))
  else
    echo "  ✓ $desc (rejected)"
    pass=$((pass + 1))
  fi
}

echo "── normalize_slug tests ──"

# Bare slug
assert_eq "bare slug" "OKry7FkxJjc2Yzgf" "$(normalize_slug "OKry7FkxJjc2Yzgf")"

# Slug with hyphens/underscores
assert_eq "slug with hyphens" "my-slug-123" "$(normalize_slug "my-slug-123")"
assert_eq "slug with underscores" "my_slug_123" "$(normalize_slug "my_slug_123")"

# Full Chronicle URL
assert_eq "full URL" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug "https://chronicle.gg/instances/OKry7FkxJjc2Yzgf")"

# URL with trailing slash
assert_eq "URL trailing slash" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug "https://chronicle.gg/instances/OKry7FkxJjc2Yzgf/")"

# API path URL
assert_eq "API path" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug "/api/v1/raidlogs/instances/OKry7FkxJjc2Yzgf")"

# API path with /events/damage suffix
assert_eq "API path with events suffix" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug "/api/v1/raidlogs/instances/OKry7FkxJjc2Yzgf/events/damage")"

# Full URL with events suffix
assert_eq "full URL with events suffix" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug "https://chronicle.gg/api/v1/raidlogs/instances/OKry7FkxJjc2Yzgf/events/damage")"

# Instance page URL (frontend route)
assert_eq "instance page URL" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug "https://chronicle.gg/instances/OKry7FkxJjc2Yzgf")"

# Bare slug with leading/trailing whitespace
assert_eq "slug with whitespace" "OKry7FkxJjc2Yzgf" \
  "$(normalize_slug " OKry7FkxJjc2Yzgf ")"

# Min-length slug (4 chars)
assert_eq "min-length slug" "abcd" "$(normalize_slug "abcd")"

# ── Rejection cases ──

# Too short (< 4 chars)
assert_fails "too short" "abc"

# Contains invalid characters
assert_fails "special chars" "slug!@#"

# Empty input
assert_fails "empty string" ""

# URL without /instances/ path
assert_fails "unrecognized URL" "https://example.com/something/else"

echo ""
echo "Results: $pass passed, $fail failed."
[[ $fail -eq 0 ]]
