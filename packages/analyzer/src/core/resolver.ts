import path from "node:path";

const RESOLVABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".php",
  ".phtml",
  ".css",
  ".html",
  ".htm"
];

function stripQueryAndHash(specifier: string): string {
  const hashFree = specifier.split("#", 1)[0] ?? "";
  return hashFree.split("?", 1)[0] ?? "";
}

function isExternalLike(specifier: string): boolean {
  return (
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier) ||
    specifier.startsWith("//") ||
    specifier.startsWith("#")
  );
}

export function isRelativeSpecifier(specifier: string, allowImplicitRelative = false): boolean {
  const sanitized = stripQueryAndHash(specifier).trim();
  if (!sanitized) {
    return false;
  }

  if (
    sanitized.startsWith("./") ||
    sanitized.startsWith("../") ||
    sanitized.startsWith("/")
  ) {
    return true;
  }

  if (!allowImplicitRelative) {
    return false;
  }

  return !isExternalLike(sanitized);
}

export function resolveRelativeImport(
  importerAbsolutePath: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
  rootPath: string,
  allowImplicitRelative = false
): string | null {
  const sanitized = stripQueryAndHash(specifier).trim();
  if (!isRelativeSpecifier(sanitized, allowImplicitRelative)) {
    return null;
  }

  const base = sanitized.startsWith("/")
    ? path.resolve(rootPath, `.${sanitized}`)
    : path.resolve(path.dirname(importerAbsolutePath), sanitized);

  const candidates = new Set<string>();
  candidates.add(base);

  for (const extension of RESOLVABLE_EXTENSIONS) {
    candidates.add(`${base}${extension}`);
    candidates.add(path.join(base, `index${extension}`));
  }

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (knownFiles.has(normalized)) {
      return normalized;
    }
  }

  return null;
}
