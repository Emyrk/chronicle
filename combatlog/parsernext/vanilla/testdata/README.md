# Capybara melee/death fixture

Source preserved public log group: `10deeee3-d8d7-46fa-aa30-ffd7f02444d9`.
File: `920e729c-6382-4021-afa0-293bf49ff871`.
Selected locally from the verified saved gzip without production requests:
first DEATH plus first SWING for each distinct (hit-info, victim-state) pair,
in source order (22 records). Lines are unchanged. No names or credentials.
This is a bounded record fixture, not a complete log.

## Spell records

`capybara-spells.log` comes from the same saved source. It retains representative HEAL crit/periodic and SPELL_DMG mitigation/hit/aura
combinations (ignoring spell identity to avoid repeated structural cases): 17 representative lines,
unchanged and in source order. Spell lookup parity uses deterministic test
values rather than embedding a dataset export.

`capybara-remaining.log` has 11 original public MISS/shield records selected by
miss result or shield school. The source has no ENV_DMG records; those cases
are explicitly synthetic in tests. Fixtures contain GUIDs necessary for decoder
parity, not names, chat, account metadata or private logs.

`capybara-records.log` contains exactly one original record per supported cast,
aura, resource or dispel event (9 total). Optional/error branches are generated
synthetically in tests, rather than checking in more GUID-bearing records.
