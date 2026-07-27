#!/usr/bin/env bash
# Upload all legacy-server DBC data to a local Chronicle instance.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGETS=(
  # Format: server|api-url|dataset-id
  "faebright|http://localhost:4000|de34ab0a-8542-4fe3-9bf9-f4503b58d999"
  "azerothcore|http://localhost:4000|e6606f7b-7e9e-4bc2-970b-bde8cd500a6b"
  "kronos|http://localhost:4000|0da7611b-a3a1-47d8-82a5-f383c43cd69d"
  "turtle|http://localhost:4000|a0404e03-e743-49e5-9876-7d5fa2931159"
  "vanillaplus|http://localhost:4000|d77b88b5-97e9-4f6b-acc9-c291f546e475"
  "lunatic|http://localhost:4000|53f9c96d-2b9a-43d9-8244-ffc6c0bf4ce6"
)

source "$SCRIPT_DIR/run.sh"
