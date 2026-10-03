#!/usr/bin/env bash
# Upload DBC data to legacy Chronicle sites.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGETS=(
  # Format: server|api-url|dataset-id
  "tbc|https://legacy.chronicleclassic.com/|857144d0-9c25-4124-ac5f-306744186e6e"
  "triumvirate|https://legacy.chronicleclassic.com/|0aaca0ed-7f02-4c18-a94f-02491bcd0b88"
  "faebright|https://legacy.chronicleclassic.com/|de34ab0a-8542-4fe3-9bf9-f4503b58d999"
  "azerothcore|https://legacy.chronicleclassic.com/|e6606f7b-7e9e-4bc2-970b-bde8cd500a6b"
  "kronos|https://legacy.chronicleclassic.com/|0da7611b-a3a1-47d8-82a5-f383c43cd69d"
  "turtle|https://legacy.chronicleclassic.com/|a0404e03-e743-49e5-9876-7d5fa2931159"
  "octowow|https://legacy.chronicleclassic.com/|2e080ee0-ca21-47d3-a7f9-8c3ba638e1c4"
  "vanillaplus|https://legacy.chronicleclassic.com/|d77b88b5-97e9-4f6b-acc9-c291f546e475"
  "lunatic|https://legacy.chronicleclassic.com/|53f9c96d-2b9a-43d9-8244-ffc6c0bf4ce6"
)

WOWDATA_TARGETS=(
  "wow-forever|/home/steven/.steam/steam/steamapps/compatdata/3492500670/pfx/drive_c/Program Files (x86)/World of Warcraft|https://legacy.chronicleclassic.com/|b69b601c-d247-44c6-9cb6-3f71053fd052|wow_classic_beta|1.60.1.70205"
)

source "$SCRIPT_DIR/run.sh"
