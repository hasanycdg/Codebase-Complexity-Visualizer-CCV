export function stripComments(source: string): string {
  let index = 0;
  let result = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\"" || char === "'" || char === "`") {
      const { end } = readStringLiteral(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (char === "/" && next === "/") {
      const lineEnd = findLineEnd(source, index + 2);
      result += " ".repeat(Math.max(0, lineEnd - index));
      index = lineEnd;
      continue;
    }

    if (char === "/" && next === "*") {
      let cursor = index + 2;
      let buffer = "  ";
      while (cursor < source.length) {
        if (source[cursor] === "*" && source[cursor + 1] === "/") {
          buffer += "  ";
          cursor += 2;
          break;
        }

        buffer += source[cursor] === "\n" ? "\n" : " ";
        cursor += 1;
      }

      result += buffer;
      index = cursor;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

export function findLineEnd(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && source[cursor] !== "\n") {
    cursor += 1;
  }
  return cursor;
}

export function readStringLiteral(source: string, start: number): { value: string; end: number } {
  const quote = source[start];
  let cursor = start + 1;
  let value = "";

  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      value += source[cursor + 1] ?? "";
      cursor += 2;
      continue;
    }

    if (char === quote) {
      return { value, end: cursor + 1 };
    }

    value += char;
    cursor += 1;
  }

  return { value, end: source.length };
}

export function isIdentifierBoundary(char: string | undefined): boolean {
  return !char || !/[A-Za-z0-9_$]/.test(char);
}

export function startsWithToken(source: string, index: number, token: string): boolean {
  if (!source.startsWith(token, index)) {
    return false;
  }

  const before = source[index - 1];
  const after = source[index + token.length];
  return isIdentifierBoundary(before) && isIdentifierBoundary(after);
}

export function skipWhitespaceAndComments(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length) {
    const char = source[cursor];
    const next = source[cursor + 1];

    if (/\s/.test(char ?? "")) {
      cursor += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      cursor = findLineEnd(source, cursor + 2);
      continue;
    }

    if (char === "/" && next === "*") {
      cursor += 2;
      while (cursor < source.length) {
        if (source[cursor] === "*" && source[cursor + 1] === "/") {
          cursor += 2;
          break;
        }
        cursor += 1;
      }
      continue;
    }

    break;
  }

  return cursor;
}
