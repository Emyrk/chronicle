package vanillaparser

import "github.com/Emyrk/chronicle/golang/wowlogs/guid"

// TotemTracking keeps track of what shaman owns what totems.
type TotemTracking struct {
	OwnerToTotems map[guid.GUID]guid.GUID
	TotemsToOwner map[guid.GUID]guid.GUID
}

// Raw logs
// 11/20 18:29:17.454  CAST: 0x0000000000024225(Oku) casts Magma Totem(10586)(Rank 3).
// 11/20 18:29:17.454  0x0000000000024225 casts Magma Totem.
// 11/20 18:29:19.474  CAST: 0xF130001D29279311(Magma Totem III) casts Magma Totem(10580)(Rank 3) on 0xF130001D29279311(Magma Totem III).
// 11/20 18:29:19.474  0xF130001D29279311's Magma Totem hits 0xF13000ED342738CD for 54 Fire damage.
// 11/20 18:29:19.474  0xF130001D29279311's Magma Totem hits 0xF13000ED342738CE for 54 Fire damage.func NewTotemTracking() *TotemTracking {
//
// Normal logs
// 11/20 18:29:19.474  Magma Totem III (Oku)'s Magma Totem hits Hateforge Warden for 54 Fire damage.
// We have to grab this from the normal logs... Ugggh.

func NewTotemTracking() *TotemTracking {
	return &TotemTracking{
		OwnerToTotems: make(map[guid.GUID]guid.GUID),
		TotemsToOwner: make(map[guid.GUID]guid.GUID),
	}
}
