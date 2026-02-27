import { describe, expect, it } from "vitest";
import { approximateCyclomaticComplexity } from "../src/core/complexity.js";

describe("approximateCyclomaticComplexity", () => {
  it("counts control flow decisions", () => {
    const source = `
function evaluate(x) {
  if (x > 0 && x < 10) {
    return x;
  } else if (x === 0 || x === 1) {
    return 0;
  }

  switch (x) {
    case 1:
      return 1;
    default:
      return x > 100 ? 100 : x;
  }
}
`;

    expect(approximateCyclomaticComplexity(source)).toBe(7);
  });

  it("ignores comments", () => {
    const source = `
// if (foo) {}
/* while (bar) {} */
const ok = true;
`;

    expect(approximateCyclomaticComplexity(source)).toBe(1);
  });
});
