import { add } from "./math";

export function loadConfig(): { base: number } {
  const base = add(1, 2);
  return { base };
}
