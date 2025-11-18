# Rust to Go Conversion - CBL Parser

## Key Conversion Patterns

### 1. **Lazy Static Regex → sync.Once**

**Rust:**
```rust
lazy_static! {
    static ref RE_DAMAGE_HIT: Regex = Regex::new(r"pattern").unwrap();
}
```

**Go:**
```go
var (
    reDamageHit *regexp.Regexp
    regexOnce   sync.Once
)

func initRegexes() {
    regexOnce.Do(func() {
        reDamageHit = regexp.MustCompile(`pattern`)
    })
}
```

### 2. **Function Signature**

**Rust:**
```rust
fn parse_cbl_line(&mut self, data: &Data, event_ts: u64, content: &str) -> Option<Vec<MessageType>>
```

**Go:**
```go
func (p *Parser) ParseCBLLine(data Data, eventTs uint64, content string) []MessageType
```

**Key Differences:**
- `&mut self` → `(p *Parser)` - receiver method
- `u64` → `uint64`
- `&str` → `string` 
- `Option<Vec<T>>` → `[]T` (nil represents None)
- snake_case → camelCase

### 3. **Regex Pattern Escaping**

**Rust:**
```rust
r"(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)"
```

**Go:**
```go
`(.+[^\s]) (cr|h)its (.+[^\s]) for (\d+)\.\s?(.*)`
```

**Key Differences:**
- Rust uses `r"..."` for raw strings
- Go uses backticks `` `...` `` for raw strings
- `\s` in Rust's raw string → `\\s` in Go's backtick string (no change needed, works as-is)

### 4. **Option Type Handling**

**Rust:**
```rust
if RE_DAMAGE.captures(&content).is_some() {
    return None;
}
```

**Go:**
```go
if reDamage.MatchString(content) {
    return nil
}
```

**Key Differences:**
- `.is_some()` → `.MatchString()` for simple existence check
- `None` → `nil`
- `Some(x)` → just return `x` directly

### 5. **Regex Captures**

**Rust:**
```rust
if let Some(caps) = RE_DAMAGE.captures(&content) {
    let attacker = &caps[1];
    let target = &caps[3];
    let amount = &caps[4];
}
```

**Go:**
```go
if matches := reDamage.FindStringSubmatch(content); matches != nil {
    attacker := matches[1]
    target := matches[3]
    amount := matches[4]
}
```

### 6. **String References**

**Rust:**
```rust
fn process(&mut self, content: &str) {
    let owned = content.to_string();
}
```

**Go:**
```go
func (p *Parser) Process(content string) {
    // strings are value types but optimized internally
    // no need for explicit conversion
}
```

## Complete Example

See `golang/wowlogs/parser/cbl_parser.go` for the full converted implementation.

## Usage Pattern

**Rust:**
```rust
let mut parser = Parser::new();
if let Some(messages) = parser.parse_cbl_line(&data, timestamp, content) {
    // process messages
}
```

**Go:**
```go
parser := &Parser{}
if messages := parser.ParseCBLLine(data, timestamp, content); messages != nil {
    // process messages
}
```

## Notes

1. **Thread Safety**: `sync.Once` ensures regexes are compiled exactly once, even with concurrent calls
2. **Naming**: Go convention uses PascalCase for exported names, camelCase for unexported
3. **Error Handling**: Rust's `Result<T, E>` and `Option<T>` → Go's multiple return values `(T, error)` or nil checks
4. **Mutability**: Go doesn't distinguish `&mut` vs `&` at the type level - everything is potentially mutable
5. **Memory**: Go's GC handles cleanup; no need for explicit lifetimes or Drop traits
