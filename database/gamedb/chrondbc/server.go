package chrondbc

// Register AzerothCore as the unconditional compiled fallback. Dataset-backed
// game data remains authoritative whenever it is present.
import _ "github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem/azerothcore"
