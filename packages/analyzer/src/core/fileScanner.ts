import { readdir } from "node:fs/promises";
import path from "node:path";
import { minimatch } from "minimatch";
import type { Language } from "@ccv/model";
import { detectLanguage, supportedExtensions } from "./language.js";

export interface ScanOptions {
  languages: Language[];
  excludePatterns: string[];
}

function hasGlob(pattern: string): boolean {
  return /[*?\[\]{}]/.test(pattern);
}

export function shouldExcludePath(relativePath: string, patterns: string[]): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  const segments = normalized.split("/").filter(Boolean);

  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern) {
      continue;
    }

    if (hasGlob(pattern)) {
      if (
        minimatch(normalized, pattern, { dot: true }) ||
        minimatch(normalized, `**/${pattern}`, { dot: true })
      ) {
        return true;
      }
      continue;
    }

    if (normalized === pattern || normalized.startsWith(`${pattern}/`) || segments.includes(pattern)) {
      return true;
    }
  }

  return false;
}

export async function scanRepository(rootPath: string, options: ScanOptions): Promise<string[]> {
  const results: string[] = [];
  const allowedExtensions = supportedExtensions(options.languages);

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(rootPath, absolutePath);

      if (shouldExcludePath(relativePath, options.excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        continue;
      }

      const language = detectLanguage(absolutePath);
      if (!language || !options.languages.includes(language)) {
        continue;
      }

      results.push(path.normalize(absolutePath));
    }
  };

  await walk(rootPath);
  return results.sort((a, b) => a.localeCompare(b));
}
