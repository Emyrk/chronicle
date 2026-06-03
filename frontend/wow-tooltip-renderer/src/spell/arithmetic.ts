// Tiny recursive-descent evaluator for the arithmetic that appears inside
// ${...} template expressions. Replaces the old `new Function()` approach so
// there is no runtime code generation.
//
// Grammar:
//   expr   = term (('+' | '-') term)*
//   term   = factor (('*' | '/') factor)*
//   factor = NUMBER | '(' expr ')' | ('+' | '-') factor
//
// Matches the old behavior:
//   - Only digits, + - * / ( ) . and whitespace are permitted.
//   - The result is rounded to the nearest integer (Math.round).
//   - Returns null for malformed input or non-finite results.

const VALID_CHARS = /^[\d+\-*/().\s]+$/;

export function evaluateArithmetic(expr: string): number | null {
  if (!VALID_CHARS.test(expr)) return null;

  let pos = 0;

  const skipWs = () => {
    while (pos < expr.length && /\s/.test(expr[pos])) pos++;
  };

  const parseExpr = (): number => {
    let value = parseTerm();
    for (;;) {
      skipWs();
      const op = expr[pos];
      if (op === "+" || op === "-") {
        pos++;
        const rhs = parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    for (;;) {
      skipWs();
      const op = expr[pos];
      if (op === "*" || op === "/") {
        pos++;
        const rhs = parseFactor();
        value = op === "*" ? value * rhs : value / rhs;
      } else {
        return value;
      }
    }
  };

  const parseFactor = (): number => {
    skipWs();
    const c = expr[pos];

    // Unary sign
    if (c === "+" || c === "-") {
      pos++;
      const operand = parseFactor();
      return c === "-" ? -operand : operand;
    }

    // Parenthesized expression
    if (c === "(") {
      pos++;
      const value = parseExpr();
      skipWs();
      if (expr[pos] !== ")") throw new Error("unbalanced parentheses");
      pos++;
      return value;
    }

    // Numeric literal (integer or decimal)
    const start = pos;
    while (pos < expr.length && /[\d.]/.test(expr[pos])) pos++;
    if (pos === start) throw new Error("expected number");
    const num = Number(expr.slice(start, pos));
    if (Number.isNaN(num)) throw new Error("invalid number");
    return num;
  };

  try {
    const result = parseExpr();
    skipWs();
    if (pos !== expr.length) return null; // trailing garbage
    if (typeof result !== "number" || !isFinite(result)) return null;
    return Math.round(result);
  } catch {
    return null;
  }
}
