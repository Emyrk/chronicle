# Regex Pattern Generator

This tool generates the regex patterns in `source.go` using a template system. Instead of manually writing out `(.+[^\s])` for every unit reference, you can use template variables like `{{.Unit}}`.

## Usage

Run the generator to update `source.go`:

```bash
cd scripts/genregex
go run main.go
```

Or build an executable:

```bash
go build -o genregex main.go
./genregex
```

## Template Variables

The following template variables are available for use in regex patterns:

| Variable | Expands To | Description |
|----------|------------|-------------|
| `{{.Unit}}` | `(.+[^\s])` | Matches a unit name (non-whitespace) |
| `{{.Number}}` | `(\d+)` | Matches a number |
| `{{.School}}` | `([a-zA-Z]+)` | Matches a damage/spell school |
| `{{.TargetType}}` | `(cr\|h)` | Matches "cr" (crit) or "h" (hit) |
| `{{.Action}}` | `(casts\|performs)` | Matches cast/perform actions |
| `{{.Effect}}` | `(blocks\|parries\|evades\|dodges\|deflects)` | Matches defensive effects |
| `{{.Resource}}` | `(Health\|health\|Mana\|Rage\|Energy\|Happiness\|happiness\|Focus)` | Matches resource types |
| `{{.GainLose}}` | `(gains\|loses)` | Matches gain/lose actions |
| `{{.Absorb}}` | `(absorbs\|resists)` | Matches absorb/resist effects |
| `{{.Miss}}` | `(s\|d)` | Matches "s" or "d" in "misses/missed" |
| `{{.Resist}}` | `(blocked\|parried\|evaded\|dodged\|resisted\|deflected)` | Matches past-tense defensive effects |
| `{{.AuraType}}` | `(is afflicted by\|gains)` | Matches aura application types |
| `{{.DeathType}}` | `(dies\|is destroyed)` | Matches death types |
| `{{.Any}}` | `(.*)` | Matches any text |
| `{{.OptAny}}` | `\s?(.*)` | Matches optional whitespace + any text |

## Example

Instead of writing:

```go
ReDamageHitOrCrit = regexp.MustCompile(`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`)
```

You can define a template pattern:

```go
{
    VarName:  "ReDamageHitOrCrit",
    Template: `{{.Unit}} {{.TargetType}}its {{.Unit}} for {{.Number}}\.{{.OptAny}}`,
},
```

## Adding New Patterns

To add a new regex pattern:

1. Edit `main.go`
2. Add your pattern to the appropriate `PatternGroup` in the `patternGroups` slice:

```go
{
    VarName:  "ReYourNewPattern",
    Template: `{{.Unit}} does something to {{.Unit}}\.`,
    Comment:  "(Optional) Description of the pattern",
},
```

3. Run `go run main.go` to regenerate `source.go`

## Adding New Template Variables

To add a new template variable:

1. Edit the `templateVars` map in `main.go`:

```go
var templateVars = map[string]string{
    // ... existing vars ...
    "YourVar": `(your|regex|pattern)`,
}
```

2. Use it in pattern templates as `{{.YourVar}}`
3. Run `go run main.go` to regenerate `source.go`

## Benefits

- **DRY (Don't Repeat Yourself)**: Define common patterns once
- **Maintainability**: Change `(.+[^\s])` in one place to update all unit references
- **Readability**: Templates are easier to read than raw regex
- **Type Safety**: The generator validates templates at build time
- **Consistency**: All patterns follow the same structure
