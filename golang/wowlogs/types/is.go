package types

func Is(prefix string, content string) (string, bool) {
  is := len(content) >= len(prefix) && content[:len(prefix)] == prefix
  if !is {
    return "", false
  }
  return content[len(prefix)+1:], true
}
