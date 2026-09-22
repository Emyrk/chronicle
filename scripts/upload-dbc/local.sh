#!/usr/bin/env bash
# Upload legacy DBCs and modern WoW client data to a local Chronicle server.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGETS=(
  "azerothcore|http://localhost:4000|00000000-0000-0000-0000-000000000001"
  "turtle|http://localhost:4000|d693ba3c-8bba-421d-8ae9-8eb2a65641cf"
  "vanillaplus|http://localhost:4000|e1520e3b-32bb-48b9-b391-d2342a582b4e"
  "faebright|http://localhost:4000/|58942539-2d80-44c9-8441-68aca794569c"
)

WOW_FOREVER_CLIENT="${WOW_FOREVER_CLIENT:-$HOME/.steam/steam/steamapps/compatdata/3492500670/pfx/drive_c/Program Files (x86)/World of Warcraft}"
WOWDATA_TARGETS=(
  "wow-forever|${WOW_FOREVER_CLIENT}|http://localhost:4000|1473f805-9c3f-40e2-a4fd-588883d2e9d3|wow_classic_beta|1.60.1.69913"
)

# shellcheck source=run.sh
source "$SCRIPT_DIR/run.sh"
