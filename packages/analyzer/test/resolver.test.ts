import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRelativeImport } from "../src/core/resolver.js";

describe("resolveRelativeImport", () => {
  const root = path.normalize("/repo");
  const knownFiles = new Set<string>([
    path.normalize("/repo/src/index.ts"),
    path.normalize("/repo/src/util.ts"),
    path.normalize("/repo/src/components/Button/index.tsx"),
    path.normalize("/repo/src/styles/main.css"),
    path.normalize("/repo/src/templates/header.php")
  ]);

  it("resolves extensionless imports", () => {
    const importer = path.normalize("/repo/src/index.ts");
    const result = resolveRelativeImport(importer, "./util", knownFiles, root);
    expect(result).toBe(path.normalize("/repo/src/util.ts"));
  });

  it("resolves directory index imports", () => {
    const importer = path.normalize("/repo/src/index.ts");
    const result = resolveRelativeImport(importer, "./components/Button", knownFiles, root);
    expect(result).toBe(path.normalize("/repo/src/components/Button/index.tsx"));
  });

  it("returns null for unresolved paths", () => {
    const importer = path.normalize("/repo/src/index.ts");
    expect(resolveRelativeImport(importer, "./missing", knownFiles, root)).toBeNull();
  });

  it("resolves implicit relative imports when enabled", () => {
    const importer = path.normalize("/repo/src/index.ts");
    const result = resolveRelativeImport(importer, "styles/main.css", knownFiles, root, true);
    expect(result).toBe(path.normalize("/repo/src/styles/main.css"));
  });

  it("strips query/hash before resolving", () => {
    const importer = path.normalize("/repo/src/index.ts");
    const result = resolveRelativeImport(importer, "templates/header.php?v=1#frag", knownFiles, root, true);
    expect(result).toBe(path.normalize("/repo/src/templates/header.php"));
  });
});
