# Quick Reference: Rust → Go Cheat Sheet

## Types & Syntax

| Rust | Go | Notes |
|------|-----|-------|
| `u8, u16, u32, u64` | `uint8, uint16, uint32, uint64` | Unsigned integers |
| `i8, i16, i32, i64` | `int8, int16, int32, int64` | Signed integers |
| `usize` | `int` or `uint` | Architecture-dependent |
| `f32, f64` | `float32, float64` | Floating point |
| `bool` | `bool` | Boolean |
| `&str` | `string` | String reference/value |
| `String` | `string` | Owned string |
| `Vec<T>` | `[]T` | Slice/vector |
| `Option<T>` | `*T` or nilable value | Nullable type |
| `Result<T, E>` | `(T, error)` | Multiple returns |
| `HashMap<K, V>` | `map[K]V` | Hash map |

## Control Flow

| Rust | Go |
|------|-----|
| `if let Some(x) = opt { }` | `if x := opt; x != nil { }` |
| `match value { }` | `switch value { }` |
| `for item in items { }` | `for _, item := range items { }` |
| `loop { }` | `for { }` |
| `while cond { }` | `for cond { }` |

## Functions

```rust
// Rust
fn parse(&mut self, data: &Data) -> Option<Vec<Message>> {
    // ...
}
```

```go
// Go
func (p *Parser) Parse(data *Data) []Message {
    // ...
}
```

## Option & Result

```rust
// Rust Option
if value.is_some() { }
if let Some(x) = value { }
value.unwrap()
value.unwrap_or(default)
```

```go
// Go nil check
if value != nil { }
if x := value; x != nil { }
// panic if needed: if value == nil { panic() }
// with default: if value == nil { value = default }
```

```rust
// Rust Result
match result {
    Ok(val) => { },
    Err(e) => { },
}
```

```go
// Go error handling
if err != nil {
    return err
}
// or
val, err := function()
```

## Regex

```rust
// Rust with lazy_static
lazy_static! {
    static ref RE: Regex = Regex::new(r"pattern").unwrap();
}

if RE.is_match(&text) { }
if let Some(caps) = RE.captures(&text) {
    let group1 = &caps[1];
}
```

```go
// Go with sync.Once
var (
    re       *regexp.Regexp
    reOnce   sync.Once
)

func init() {
    reOnce.Do(func() {
        re = regexp.MustCompile(`pattern`)
    })
}

if re.MatchString(text) { }
if matches := re.FindStringSubmatch(text); matches != nil {
    group1 := matches[1]
}
```

## Structs & Methods

```rust
// Rust
struct Parser {
    field: String,
}

impl Parser {
    fn new() -> Self {
        Parser { field: String::new() }
    }
    
    fn method(&mut self) { }
}
```

```go
// Go
type Parser struct {
    Field string
}

func NewParser() *Parser {
    return &Parser{
        Field: "",
    }
}

func (p *Parser) Method() { }
```

## Ownership & References

```rust
// Rust - explicit borrowing
fn process(data: &Data)        // immutable borrow
fn modify(data: &mut Data)     // mutable borrow
fn consume(data: Data)         // take ownership
```

```go
// Go - implicit (everything is copyable or reference)
func Process(data *Data)       // pointer (can modify)
func Consume(data Data)        // copy (value types)
```

## Common Patterns

### Initialization

```rust
// Rust
let mut vec = Vec::new();
let map = HashMap::new();
```

```go
// Go
vec := make([]Type, 0)
// or: vec := []Type{}
m := make(map[KeyType]ValueType)
// or: m := map[KeyType]ValueType{}
```

### String Building

```rust
// Rust
let mut s = String::new();
s.push_str("hello");
// or
let s = format!("hello {}", name);
```

```go
// Go
var b strings.Builder
b.WriteString("hello")
s := b.String()
// or
s := fmt.Sprintf("hello %s", name)
```

### Error Handling

```rust
// Rust
fn may_fail() -> Result<Value, Error> {
    let x = other_fn()?;  // early return on error
    Ok(x)
}
```

```go
// Go
func mayFail() (Value, error) {
    x, err := otherFn()
    if err != nil {
        return Value{}, err
    }
    return x, nil
}
```

## Common Gotchas

1. **Capitalization matters in Go**: `Parser` is exported, `parser` is not
2. **No semicolons needed** in Go (usually)
3. **Multiple return values** instead of Result/Option
4. **No generics** in older Go (< 1.18), use interfaces or code gen
5. **Slices vs Arrays**: `[]T` is a slice (dynamic), `[N]T` is array (fixed)
6. **Make vs New**: `make()` for slices/maps/channels, `new()` for pointers
7. **Interface{} is any**: `interface{}` is like Rust's `dyn Any`

## Testing

```rust
// Rust
#[test]
fn test_parser() {
    assert_eq!(result, expected);
}
```

```go
// Go
func TestParser(t *testing.T) {
    if result != expected {
        t.Errorf("got %v, want %v", result, expected)
    }
}
```

## Performance

| Rust | Go | Notes |
|------|-----|-------|
| Zero-cost abstractions | Some runtime cost | Go has GC overhead |
| Compile-time borrow checking | Runtime checks | Different safety model |
| No GC | Garbage collected | Go manages memory |
| Faster compile for small projects | Faster compile overall | Go optimized for build speed |
| Generally faster runtime | Fast enough for most cases | Both are performant |

## When to use what

- **Rust**: Systems programming, max performance, no GC, FFI
- **Go**: Web services, CLI tools, concurrent apps, rapid development
