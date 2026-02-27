import path from "node:path";
import { DEFAULT_LANGUAGES, type Language } from "@ccv/model";

const LANGUAGE_EXTENSIONS: Record<Language, string[]> = {
  js: [".js", ".jsx", ".mjs", ".cjs"],
  ts: [".ts", ".tsx", ".mts", ".cts"],
  java: [".java"],
  py: [".py"],
  php: [".php", ".phtml", ".php5"],
  css: [".css"],
  html: [".html", ".htm"]
};

const EXTENSION_TO_LANGUAGE = new Map<string, Language>(
  Object.entries(LANGUAGE_EXTENSIONS).flatMap(([language, extensions]) =>
    extensions.map((extension) => [extension, language as Language] as const)
  )
);

export function detectLanguage(filePath: string): Language | null {
  return EXTENSION_TO_LANGUAGE.get(path.extname(filePath).toLowerCase()) ?? null;
}

export function languageExtensions(language: Language): string[] {
  return LANGUAGE_EXTENSIONS[language] ?? [];
}

export function supportedExtensions(languages: Language[]): Set<string> {
  return new Set(
    languages.flatMap((language) => {
      const extensions = LANGUAGE_EXTENSIONS[language];
      return extensions ?? [];
    })
  );
}

export function parseLanguages(raw: string | undefined): Language[] {
  if (!raw) {
    return [...DEFAULT_LANGUAGES];
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value === "javascript") return "js";
      if (value === "typescript") return "ts";
      if (value === "python") return "py";
      if (value === "hypertext") return "html";
      return value;
    })
    .filter((value): value is Language =>
      ["js", "ts", "java", "py", "php", "css", "html"].includes(value)
    );

  if (parsed.length === 0) {
    throw new Error(`No supported language in --languages=${raw}`);
  }

  return [...new Set(parsed)];
}

export function toPosixPath(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
}
