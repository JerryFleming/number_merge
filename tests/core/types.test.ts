import { describe, it, expect } from "vitest";
import { tierValue, COLS, ROWS } from "../../src/core/types";

describe("tierValue", () => {
  it("is 2^tier", () => {
    expect(tierValue(1)).toBe(2);
    expect(tierValue(3)).toBe(8);
    expect(tierValue(10)).toBe(1024);
  });
});

describe("board dimensions", () => {
  it("is 5 columns by 7 rows", () => {
    expect(COLS).toBe(5);
    expect(ROWS).toBe(7);
  });
});
