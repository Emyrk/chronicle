package services

import "github.com/Gophercraft/core/vsn"

// ServerName and ServerBuild identify the bundled fallback data. Runtime game
// data and flavor are selected by dataset; AzerothCore is used only when a
// dataset does not provide data.
const ServerName = ServerIdentityAzerothcore
const ServerBuild = vsn.V3_3_5a

const ServerIdentityTurtle = "turtle"
const ServerIdentityAzerothcore = "azerothcore"
const ServerIdentityKronos = "kronos"
const ServerIdentityEpoch = "epoch"
const ServerIdentityVanillaPlus = "vanillaplus"
const ServerIdentityOctoWoW = "octowow"
