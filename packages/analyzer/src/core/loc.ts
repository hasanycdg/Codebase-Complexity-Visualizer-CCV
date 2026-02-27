export function countLoc(source: string): number {
  if (!source) {
    return 0;
  }

  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
}
