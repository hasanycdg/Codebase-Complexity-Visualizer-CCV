#!/usr/bin/env node
import path from "node:path";
import {
  DEFAULT_EXCLUDES,
  DEFAULT_WEIGHTS,
  type RiskWeights
} from "@ccv/model";
import { analyzeRepository } from "./core/analyzer.js";
import { parseLanguages } from "./core/language.js";

interface ParsedArgs {
  repoPath: string;
  outPath: string;
  languages: ReturnType<typeof parseLanguages>;
  excludePatterns: string[];
  weights: RiskWeights;
}

function printUsage(): void {
  console.log(`
Usage:
  ccv analyze <repoPath> --out analysis.json

Options:
  --languages js,ts,java,py,php,css,html
  --exclude node_modules,.git,dist,build
  --weights loc=0.8,complexity=1.4,fanIn=1,fanOut=1,cycle=2.5

Example:
  ccv analyze ./my-repo --out ./analysis.json --languages js,ts,php,css,html --exclude node_modules,.git,dist --weights loc=0.8,complexity=1.4,fanIn=1,fanOut=1,cycle=2.5
`);
}

function parseWeights(raw: string | undefined): RiskWeights {
  if (!raw) {
    return { ...DEFAULT_WEIGHTS };
  }

  const merged: RiskWeights = { ...DEFAULT_WEIGHTS };

  for (const pair of raw.split(",")) {
    const [key, value] = pair.split("=").map((entry) => entry.trim());
    if (!key || !value) {
      throw new Error(`Invalid --weights token: ${pair}`);
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid numeric weight for ${key}: ${value}`);
    }

    if (key === "loc" || key === "complexity" || key === "fanIn" || key === "fanOut" || key === "cycle") {
      merged[key] = numeric;
      continue;
    }

    throw new Error(`Unknown weight key: ${key}`);
  }

  return merged;
}

function parseOptionValue(args: string[], index: number): { value: string; nextIndex: number } {
  const token = args[index];
  if (!token) {
    throw new Error("Missing option token");
  }

  if (!token.startsWith("--")) {
    throw new Error(`Unexpected option token: ${token}`);
  }

  const equalIndex = token.indexOf("=");
  if (equalIndex !== -1) {
    return {
      value: token.slice(equalIndex + 1),
      nextIndex: index + 1
    };
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${token}`);
  }

  return {
    value,
    nextIndex: index + 2
  };
}

function parseAnalyzeArgs(args: string[]): ParsedArgs {
  if (args.length < 2) {
    throw new Error("Missing repoPath");
  }

  const repoPath = args[1];
  if (!repoPath) {
    throw new Error("Missing repoPath");
  }

  let outPath: string | null = null;
  let languagesRaw: string | undefined;
  let excludeRaw: string | undefined;
  let weightsRaw: string | undefined;

  let index = 2;
  while (index < args.length) {
    const option = args[index];
    if (!option) {
      break;
    }

    if (option.startsWith("--out")) {
      const parsed = parseOptionValue(args, index);
      outPath = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (option.startsWith("--languages")) {
      const parsed = parseOptionValue(args, index);
      languagesRaw = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (option.startsWith("--exclude")) {
      const parsed = parseOptionValue(args, index);
      excludeRaw = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (option.startsWith("--weights")) {
      const parsed = parseOptionValue(args, index);
      weightsRaw = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    throw new Error(`Unknown option: ${option}`);
  }

  if (!outPath) {
    throw new Error("The --out option is required.");
  }

  return {
    repoPath: path.resolve(repoPath),
    outPath: path.resolve(outPath),
    languages: parseLanguages(languagesRaw),
    excludePatterns: excludeRaw
      ? excludeRaw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [...DEFAULT_EXCLUDES],
    weights: parseWeights(weightsRaw)
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }

  const command = args[0];
  if (!command) {
    throw new Error("Missing command");
  }

  if (command !== "analyze") {
    throw new Error(`Unknown command: ${command}`);
  }

  const parsed = parseAnalyzeArgs(args);

  await analyzeRepository({
    repoPath: parsed.repoPath,
    outPath: parsed.outPath,
    languages: parsed.languages,
    excludePatterns: parsed.excludePatterns,
    weights: parsed.weights,
    logger: (line) => console.log(line)
  });
}

main().catch((error: unknown) => {
  console.error(`[ccv] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
