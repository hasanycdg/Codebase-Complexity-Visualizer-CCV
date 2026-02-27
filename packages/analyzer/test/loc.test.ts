import { describe, expect, it } from "vitest";
import { countLoc } from "../src/core/loc.js";

describe("countLoc", () => {
  it("counts non-empty lines", () => {
    const source = `
const a = 1;

const b = 2;
`;

    expect(countLoc(source)).toBe(2);
  });

  it("returns 0 for empty input", () => {
    expect(countLoc("")).toBe(0);
  });
});
