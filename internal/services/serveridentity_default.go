//go:build !turtle && !epoch && !kronos && !warmane && !ascension

package services

import "github.com/Gophercraft/core/vsn"

// ServerName identifies the WoW server this binary was built for.
// Default to turtle when no server build tag is specified.
const ServerName = ServerIdentityTurtle
const ServerBuild = vsn.V1_12_2
