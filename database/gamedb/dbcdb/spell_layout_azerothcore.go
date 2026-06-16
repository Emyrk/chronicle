//go:build azerothcore

package dbcdb

func init() {
	// Set the override so this binary's compiled-in Spell.dbc uses the
	// extended layout. The layout itself is registered unconditionally in
	// spell_layout_extended.go's init().
	SpellBuildOverride = ExtendedSpellBuild
}
