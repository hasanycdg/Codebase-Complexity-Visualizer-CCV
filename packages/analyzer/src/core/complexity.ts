import { stripComments } from "./text.js";

const CONTROL_PATTERNS: RegExp[] = [
  /\bif\b/g,
  /\bfor\b/g,
  /\bwhile\b/g,
  /\bcase\b/g,
  /\bcatch\b/g,
  /\?[^:]/g,
  /&&/g,
  /\|\|/g
];

export function approximateCyclomaticComplexity(source: string): number {
  const stripped = stripComments(source);
  if (stripped.trim().length === 0) {
    return 0;
  }

  let complexity = 1;
  for (const pattern of CONTROL_PATTERNS) {
    const matches = stripped.match(pattern);
    complexity += matches?.length ?? 0;
  }

  return complexity;
}
