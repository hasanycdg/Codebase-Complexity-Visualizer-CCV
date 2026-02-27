import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_EXCLUDES,
  DEFAULT_LANGUAGES,
  DEFAULT_WEIGHTS,
  roundMetric,
  validateAnalysisModel,
  type AnalysisModel,
  type DependencyEdge,
  type FileAnalysis,
  type ImportRef,
  type Language,
  type RiskWeights,
  type StronglyConnectedComponent
} from "@ccv/model";
import { approximateCyclomaticComplexity } from "./complexity.js";
import { scanRepository } from "./fileScanner.js";
import {
  parseCssImports,
  parseHtmlImports,
  parseJavaImports,
  parseJsTsImports,
  parsePhpImports,
  parsePythonImports
} from "./importParser.js";
import { detectLanguage, toPosixPath } from "./language.js";
import { countLoc } from "./loc.js";
import { resolveRelativeImport, isRelativeSpecifier } from "./resolver.js";
import { calculateRiskScore } from "./risk.js";
import { tarjanScc } from "./tarjan.js";

export interface AnalyzeRepositoryOptions {
  repoPath: string;
  outPath: string;
  languages?: Language[];
  excludePatterns?: string[];
  weights?: RiskWeights;
  logger?: (line: string) => void;
}

interface FileInterim {
  absPath: string;
  relPath: string;
  language: Language;
  loc: number;
  complexity: number;
  imports: ImportRef[];
}

const defaultLogger = (line: string): void => {
  console.log(line);
};

function parseImportsByLanguage(language: Language, source: string): string[] {
  if (language === "js" || language === "ts") {
    return parseJsTsImports(source);
  }
  if (language === "java") {
    return parseJavaImports(source);
  }
  if (language === "py") {
    return parsePythonImports(source);
  }
  if (language === "php") {
    return parsePhpImports(source);
  }
  if (language === "css") {
    return parseCssImports(source);
  }
  return parseHtmlImports(source);
}

function allowsImplicitRelativeSpecifiers(language: Language): boolean {
  return language === "php" || language === "css" || language === "html";
}

export async function analyzeRepository(options: AnalyzeRepositoryOptions): Promise<AnalysisModel> {
  const logger = options.logger ?? defaultLogger;
  const rootPath = path.resolve(options.repoPath);
  const outPath = path.resolve(options.outPath);
  const languages = options.languages ?? [...DEFAULT_LANGUAGES];
  const excludePatterns = options.excludePatterns ?? [...DEFAULT_EXCLUDES];
  const weights = options.weights ?? { ...DEFAULT_WEIGHTS };

  logger(`[ccv] Scanning: ${rootPath}`);

  const files = await scanRepository(rootPath, { languages, excludePatterns });
  logger(`[ccv] Source files found: ${files.length}`);

  const knownFiles = new Set(files.map((filePath) => path.normalize(filePath)));
  const interimFiles: FileInterim[] = [];

  for (const absPath of files) {
    const relPath = toPosixPath(path.relative(rootPath, absPath));
    const language = detectLanguage(absPath);
    if (!language) {
      continue;
    }

    const source = await readFile(absPath, "utf8");
    const loc = countLoc(source);
    const complexity = approximateCyclomaticComplexity(source);
    const allowImplicitRelative = allowsImplicitRelativeSpecifiers(language);
    const imports = parseImportsByLanguage(language, source).map((specifier): ImportRef => {
      const resolvedAbsolutePath = resolveRelativeImport(
        absPath,
        specifier,
        knownFiles,
        rootPath,
        allowImplicitRelative
      );
      const resolvedPath = resolvedAbsolutePath
        ? toPosixPath(path.relative(rootPath, resolvedAbsolutePath))
        : null;
      const external = resolvedPath === null && !isRelativeSpecifier(specifier, allowImplicitRelative);

      return {
        specifier,
        resolvedPath,
        external
      };
    });

    interimFiles.push({
      absPath,
      relPath,
      language,
      loc,
      complexity,
      imports
    });
  }

  const adjacency = new Map<string, Set<string>>();
  for (const file of interimFiles) {
    adjacency.set(file.relPath, new Set());
  }

  const edges: DependencyEdge[] = [];
  const edgeIds = new Set<string>();

  for (const file of interimFiles) {
    for (const entry of file.imports) {
      if (entry.resolvedPath) {
        adjacency.get(file.relPath)?.add(entry.resolvedPath);
        const id = `${file.relPath}->${entry.resolvedPath}->${entry.specifier}`;
        if (!edgeIds.has(id)) {
          edgeIds.add(id);
          edges.push({
            from: file.relPath,
            to: entry.resolvedPath,
            specifier: entry.specifier,
            external: false
          });
        }
      } else if (entry.external) {
        const id = `${file.relPath}->${entry.specifier}->external`;
        if (!edgeIds.has(id)) {
          edgeIds.add(id);
          edges.push({
            from: file.relPath,
            to: entry.specifier,
            specifier: entry.specifier,
            external: true
          });
        }
      }
    }
  }

  const nodeIds = interimFiles.map((file) => file.relPath);
  const allScc = tarjanScc(nodeIds, adjacency);

  const cycleNodes = new Set<string>();
  const scc: StronglyConnectedComponent[] = allScc.map((nodes, index) => {
    const hasSelfLoop =
      nodes.length === 1 &&
      nodes[0] !== undefined &&
      adjacency.get(nodes[0])?.has(nodes[0]) === true;

    if (nodes.length > 1 || hasSelfLoop) {
      for (const node of nodes) {
        cycleNodes.add(node);
      }
    }

    return {
      id: index + 1,
      size: nodes.length,
      nodes
    };
  });

  const fanInMap = new Map<string, number>();
  const fanOutMap = new Map<string, number>();

  for (const file of interimFiles) {
    fanInMap.set(file.relPath, 0);
    fanOutMap.set(file.relPath, adjacency.get(file.relPath)?.size ?? 0);
  }

  for (const edge of edges) {
    if (!edge.external) {
      fanInMap.set(edge.to, (fanInMap.get(edge.to) ?? 0) + 1);
    }
  }

  const fileAnalyses: FileAnalysis[] = interimFiles
    .map((file): FileAnalysis => {
      const fanIn = fanInMap.get(file.relPath) ?? 0;
      const fanOut = fanOutMap.get(file.relPath) ?? 0;
      const inCycle = cycleNodes.has(file.relPath);
      const riskScore = roundMetric(
        calculateRiskScore(
          {
            loc: file.loc,
            complexity: file.complexity,
            fanIn,
            fanOut,
            inCycle
          },
          weights
        )
      );

      return {
        path: file.relPath,
        language: file.language,
        loc: file.loc,
        complexity: file.complexity,
        fanIn,
        fanOut,
        inCycle,
        riskScore,
        imports: file.imports
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const cycleCount = scc.filter((component) => {
    if (component.size > 1) {
      return true;
    }

    const node = component.nodes[0];
    return node ? adjacency.get(node)?.has(node) === true : false;
  }).length;

  const model: AnalysisModel = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    rootPath,
    config: {
      languages,
      exclude: excludePatterns,
      weights
    },
    summary: {
      fileCount: fileAnalyses.length,
      dependencyCount: edges.length,
      cycleCount,
      sccCount: scc.length
    },
    files: fileAnalyses,
    edges: edges.sort((a, b) => {
      if (a.from === b.from) {
        return a.to.localeCompare(b.to);
      }
      return a.from.localeCompare(b.from);
    }),
    scc
  };

  validateAnalysisModel(model);

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(model, null, 2)}\n`, "utf8");

  logger(`[ccv] Analysis written to: ${outPath}`);
  return model;
}
