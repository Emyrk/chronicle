#!/usr/bin/env bash
# Upload WoW Forever data to the legacy Chronicle site.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Consumed by the sourced shared runner.
# shellcheck disable=SC2034
WOWDATA_TARGETS=(
  "wow-forever|/home/steven/.steam/steam/steamapps/compatdata/3492500670/pfx/drive_c/Program Files (x86)/World of Warcraft|https://legacy.chronicleclassic.com/|b69b601c-d247-44c6-9cb6-3f71053fd052|wowf|1.60.1.70840|local|/home/steven/.steam/steam/steamapps/compatdata/3492500670/pfx/drive_c/Program Files (x86)/World of Warcraft/_forever_/Cache/ADB/enUS/DBCache.bin"
)

# Keep the base CASC data and DBCache overlay on the same installed build.
# shellcheck disable=SC1091
# shellcheck source=run.sh
source "$SCRIPT_DIR/run.sh" "$@"
