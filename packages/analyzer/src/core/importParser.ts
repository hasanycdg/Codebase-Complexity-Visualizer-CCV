import {
  readStringLiteral,
  skipWhitespaceAndComments,
  startsWithToken
} from "./text.js";

interface ParseResult {
  nextIndex: number;
  specifier: string | null;
}

function scanToBoundary(source: string, start: number): number {
  let cursor = start;
  let depth = 0;

  while (cursor < source.length) {
    cursor = skipWhitespaceAndComments(source, cursor);
    if (cursor >= source.length) {
      return cursor;
    }

    const char = source[cursor];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = readStringLiteral(source, cursor).end;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
      cursor += 1;
      continue;
    }

    if (char === ")" || char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      cursor += 1;
      continue;
    }

    if ((char === ";" || char === "\n") && depth === 0) {
      return cursor + 1;
    }

    cursor += 1;
  }

  return source.length;
}

function parseImport(source: string, start: number): ParseResult {
  let cursor = skipWhitespaceAndComments(source, start + "import".length);

  if (source[cursor] === "(") {
    cursor = skipWhitespaceAndComments(source, cursor + 1);
    if (source[cursor] === "\"" || source[cursor] === "'") {
      const literal = readStringLiteral(source, cursor);
      const nextIndex = scanToBoundary(source, literal.end);
      return { nextIndex, specifier: literal.value };
    }

    return { nextIndex: scanToBoundary(source, cursor), specifier: null };
  }

  if (source[cursor] === "\"" || source[cursor] === "'") {
    const literal = readStringLiteral(source, cursor);
    return { nextIndex: scanToBoundary(source, literal.end), specifier: literal.value };
  }

  while (cursor < source.length) {
    cursor = skipWhitespaceAndComments(source, cursor);
    if (cursor >= source.length) {
      break;
    }

    if (startsWithToken(source, cursor, "from")) {
      cursor = skipWhitespaceAndComments(source, cursor + "from".length);
      if (source[cursor] === "\"" || source[cursor] === "'") {
        const literal = readStringLiteral(source, cursor);
        return { nextIndex: scanToBoundary(source, literal.end), specifier: literal.value };
      }

      return { nextIndex: scanToBoundary(source, cursor), specifier: null };
    }

    const char = source[cursor];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = readStringLiteral(source, cursor).end;
      continue;
    }

    if (char === ";" || char === "\n") {
      return { nextIndex: cursor + 1, specifier: null };
    }

    cursor += 1;
  }

  return { nextIndex: cursor, specifier: null };
}

function parseExport(source: string, start: number): ParseResult {
  let cursor = skipWhitespaceAndComments(source, start + "export".length);

  while (cursor < source.length) {
    cursor = skipWhitespaceAndComments(source, cursor);
    if (cursor >= source.length) {
      break;
    }

    if (startsWithToken(source, cursor, "from")) {
      cursor = skipWhitespaceAndComments(source, cursor + "from".length);
      if (source[cursor] === "\"" || source[cursor] === "'") {
        const literal = readStringLiteral(source, cursor);
        return { nextIndex: scanToBoundary(source, literal.end), specifier: literal.value };
      }
      return { nextIndex: scanToBoundary(source, cursor), specifier: null };
    }

    const char = source[cursor];
    if (char === "\"" || char === "'" || char === "`") {
      cursor = readStringLiteral(source, cursor).end;
      continue;
    }

    if (char === ";" || char === "\n") {
      return { nextIndex: cursor + 1, specifier: null };
    }

    cursor += 1;
  }

  return { nextIndex: cursor, specifier: null };
}

function parseRequire(source: string, start: number): ParseResult {
  let cursor = skipWhitespaceAndComments(source, start + "require".length);
  if (source[cursor] !== "(") {
    return { nextIndex: cursor + 1, specifier: null };
  }

  cursor = skipWhitespaceAndComments(source, cursor + 1);
  if (source[cursor] === "\"" || source[cursor] === "'") {
    const literal = readStringLiteral(source, cursor);
    return { nextIndex: scanToBoundary(source, literal.end), specifier: literal.value };
  }

  return { nextIndex: scanToBoundary(source, cursor), specifier: null };
}

export function parseJsTsImports(source: string): string[] {
  const imports = new Set<string>();
  let index = 0;

  while (index < source.length) {
    index = skipWhitespaceAndComments(source, index);
    if (index >= source.length) {
      break;
    }

    const char = source[index];
    if (char === "\"" || char === "'" || char === "`") {
      index = readStringLiteral(source, index).end;
      continue;
    }

    if (startsWithToken(source, index, "import")) {
      const parsed = parseImport(source, index);
      if (parsed.specifier) imports.add(parsed.specifier);
      index = Math.max(parsed.nextIndex, index + 1);
      continue;
    }

    if (startsWithToken(source, index, "export")) {
      const parsed = parseExport(source, index);
      if (parsed.specifier) imports.add(parsed.specifier);
      index = Math.max(parsed.nextIndex, index + 1);
      continue;
    }

    if (startsWithToken(source, index, "require")) {
      const parsed = parseRequire(source, index);
      if (parsed.specifier) imports.add(parsed.specifier);
      index = Math.max(parsed.nextIndex, index + 1);
      continue;
    }

    index += 1;
  }

  return [...imports];
}

export function parseJavaImports(source: string): string[] {
  const imports = new Set<string>();
  const importPattern = /^\s*import\s+(?:static\s+)?([A-Za-z0-9_.*$]+)\s*;/gm;

  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) {
    const moduleName = match[1];
    if (moduleName) {
      imports.add(moduleName);
    }
  }

  return [...imports];
}

export function parsePythonImports(source: string): string[] {
  const imports = new Set<string>();
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+([A-Za-z0-9_.,\s]+)\s*$/);
    if (importMatch) {
      const importBlock = importMatch[1];
      if (!importBlock) {
        continue;
      }

      for (const moduleName of importBlock.split(",")) {
        const trimmed = moduleName.trim();
        if (trimmed) imports.add(trimmed);
      }
      continue;
    }

    const fromMatch = line.match(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+[A-Za-z0-9_.*,\s]+$/);
    if (fromMatch) {
      const fromPath = fromMatch[1];
      if (fromPath) {
        imports.add(fromPath);
      }
    }
  }

  return [...imports];
}

function cleanSpecifier(specifier: string): string | null {
  const trimmed = specifier.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function parsePhpImports(source: string): string[] {
  const imports = new Set<string>();
  const includePattern =
    /\b(?:include|include_once|require|require_once)\s*(?:\(\s*)?["']([^"']+)["']\s*\)?/g;

  let match: RegExpExecArray | null;
  while ((match = includePattern.exec(source)) !== null) {
    const raw = match[1];
    if (!raw) {
      continue;
    }

    const specifier = cleanSpecifier(raw);
    if (specifier) {
      imports.add(specifier);
    }
  }

  return [...imports];
}

export function parseCssImports(source: string): string[] {
  const imports = new Set<string>();

  const cssImportPattern =
    /@import\s+(?:url\(\s*(?:["']([^"']+)["']|([^)\s]+))\s*\)|["']([^"']+)["'])/gi;

  let match: RegExpExecArray | null;
  while ((match = cssImportPattern.exec(source)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? null;
    if (!raw) {
      continue;
    }

    const specifier = cleanSpecifier(raw);
    if (specifier) {
      imports.add(specifier);
    }
  }

  return [...imports];
}

export function parseHtmlImports(source: string): string[] {
  const imports = new Set<string>();
  const srcPattern = /<(?:script|img|source|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const hrefPattern = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;

  const collect = (pattern: RegExp): void => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const raw = match[1];
      if (!raw) {
        continue;
      }

      const specifier = cleanSpecifier(raw);
      if (!specifier) {
        continue;
      }

      imports.add(specifier);
    }
  };

  collect(srcPattern);
  collect(hrefPattern);

  return [...imports];
}
