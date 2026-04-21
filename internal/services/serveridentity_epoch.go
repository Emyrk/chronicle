//go:build epoch

package services

import "github.com/Gophercraft/core/vsn"

// ServerName identifies the WoW server this binary was built for.
const ServerName = ServerIdentityEpoch
const ServerBuild = vsn.V3_3_5a
