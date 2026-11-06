# Archived Renown template boss values

The canonical values from `rating_renown_template_bosses` are preserved in
[`rating-renown-template-bosses.csv`](rating-renown-template-bosses.csv) before
removing the ratings implementation while preserving v1 Performances. The CSV includes every historical
`(flavor, version, instance_name, encounter_name, renown_points)` row seeded
by migrations 000313, 000314, and 000315: vanilla v1 (62),
nightmare-of-ursol v1 (32), and vanillaplus v1/v2/v3 (10/11/12), 127 rows total.
Versions 2 and 3 inherit earlier vanillaplus rows and add The Nameless Hermit
and Azus the Bloodseeker, respectively. Values are archived as individual
versioned rows rather than just the latest version.

This is a snapshot of **migration-seeded values**, not an export from a live
production database. Before applying the destructive table-drop migration,
export any production-only or manually modified rows and compare them with
this CSV; the migration does not export database contents automatically.
