import { describe, expect, it } from "vitest";
import { parseLanguages } from "../src/core/language.js";

describe("parseLanguages", () => {
  it("accepts php/css/html", () => {
    expect(parseLanguages("php,css,html")).toEqual(["php", "css", "html"]);
  });

  it("keeps legacy aliases", () => {
    expect(parseLanguages("javascript,typescript,python")).toEqual(["js", "ts", "py"]);
  });
});
