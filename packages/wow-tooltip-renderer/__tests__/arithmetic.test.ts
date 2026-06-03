import { describe, it, expect } from "vitest";
import { evaluateArithmetic } from "../src/spell/arithmetic.js";

describe("evaluateArithmetic", () => {
  it("evaluates basic operators with precedence", () => {
    expect(evaluateArithmetic("5*3")).toBe(15);
    expect(evaluateArithmetic("2+3*4")).toBe(14);
    expect(evaluateArithmetic("(2+3)*4")).toBe(20);
    expect(evaluateArithmetic("10/4")).toBe(3); // 2.5 rounds to 3 (round half up)
    expect(evaluateArithmetic("10-3-2")).toBe(5); // left-associative
  });

  it("rounds to the nearest integer", () => {
    expect(evaluateArithmetic("337*5")).toBe(1685);
    expect(evaluateArithmetic("13/2")).toBe(7); // 6.5 -> 7
    expect(evaluateArithmetic("0.013+0.025")).toBe(0); // 0.038 -> 0
  });

  it("handles unary minus and decimals", () => {
    expect(evaluateArithmetic("-5")).toBe(-5);
    expect(evaluateArithmetic("2.5*2")).toBe(5);
    expect(evaluateArithmetic("-(2+3)")).toBe(-5);
  });

  it("returns null for invalid input (unresolved variables, letters)", () => {
    expect(evaluateArithmetic("5*$AR")).toBeNull();
    expect(evaluateArithmetic("(0.013*$SPH+0.025*$AP)*5")).toBeNull();
    expect(evaluateArithmetic("")).toBeNull();
    expect(evaluateArithmetic("5*")).toBeNull(); // incomplete
    expect(evaluateArithmetic("(5+3")).toBeNull(); // unbalanced
  });

  it("does not execute arbitrary code (no Function constructor)", () => {
    // Anything outside the numeric charset is rejected outright.
    expect(evaluateArithmetic("process.exit(1)")).toBeNull();
    expect(evaluateArithmetic("1;alert(1)")).toBeNull();
  });
});
