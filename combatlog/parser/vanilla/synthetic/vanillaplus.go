package synthetic

// VanillaPlus retains its original damage-only, entry-only matching and
// UNIT_INFO observations, with no activity suppression or boundary resets.
func newVanillaPlus() *shadowBosses {
	return newShadowBosses(shadowBossOptions{}).
		shadowed(11502, "Ragnaros", shadowSource{entry: 40004}).
		shadowed(11982, "Magmadar", shadowSource{entry: 20006}).
		shadowed(11983, "Firemaw", shadowSource{entry: 25122}).
		shadowed(14401, "Master Elemental Shaper Krixix", shadowSource{entry: 25118}).
		shadowed(25227, "Renault Mograine", shadowSource{entry: 25253})
}
