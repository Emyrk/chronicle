# Legacy spell compatibility goldens

Each TSV data row is one reviewable tuple:

```text
spell_id<TAB>field<TAB>JSON value
```

Blank lines and lines beginning with `#` are allowed. The committed spell IDs
are a fixed regression sample selected during initial authoring from a fixed-seed
candidate set, then augmented for familiar class spells and varied spell shapes.
The test never selects spells randomly at runtime.

## Add or change coverage

- To add a spell or field assertion, copy an existing row and replace the value
  with any placeholder text.
- To define a new field, add its evaluator to `spellGoldenEvaluators` in
  `spell_golden_test.go`, then add rows using that field name.
- Run `make update-spell-goldens`. Update mode preserves comments, blank lines,
  tuple order, spell IDs, and field names while deterministically replacing only
  tuple values.
- Review the committed TSV diff. These files snapshot compatibility behavior;
  they do not assert that every current behavior is ideal.

Run the check without modifying files with:

```sh
go test ./database/gamedb/chrondbc -run '^TestLegacySpellGoldenParity$'
```

Do not use `go test ./... -update`; unrelated packages may reject the package
specific flag.
