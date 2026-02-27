import Database from "@tauri-apps/plugin-sql";
import type { AnalysisRecord, AppSettings, RecentProject } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const SETTINGS_KEY = "app_settings_v1";

let dbPromise: Promise<Database> | null = null;

async function initDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:ccv.db").then(async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS recent_projects (
          path TEXT PRIMARY KEY,
          last_opened TEXT NOT NULL
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS analyses (
          project_path TEXT PRIMARY KEY,
          analysis_path TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      return db;
    });
  }

  return dbPromise;
}

export async function listRecentProjects(limit = 10): Promise<RecentProject[]> {
  const db = await initDb();
  const rows = await db.select<{ path: string; last_opened: string }[]>(
    "SELECT path, last_opened FROM recent_projects ORDER BY last_opened DESC LIMIT $1",
    [limit]
  );

  return rows.map((row) => ({
    path: row.path,
    lastOpened: row.last_opened
  }));
}

export async function saveRecentProject(projectPath: string): Promise<void> {
  const db = await initDb();
  await db.execute(
    `
      INSERT INTO recent_projects (path, last_opened)
      VALUES ($1, datetime('now'))
      ON CONFLICT(path) DO UPDATE SET last_opened = excluded.last_opened;
    `,
    [projectPath]
  );
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await initDb();
  const rows = await db.select<{ value: string }[]>("SELECT value FROM settings WHERE key = $1", [
    SETTINGS_KEY
  ]);

  const firstRow = rows.at(0);
  if (!firstRow) {
    await saveSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } };
  }

  try {
    const parsed = JSON.parse(firstRow.value) as AppSettings;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      weights: {
        ...DEFAULT_SETTINGS.weights,
        ...parsed.weights
      },
      excludePatterns: parsed.excludePatterns ?? [...DEFAULT_SETTINGS.excludePatterns],
      languages: parsed.languages ?? [...DEFAULT_SETTINGS.languages]
    };
  } catch {
    await saveSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await initDb();
  await db.execute(
    `
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `,
    [SETTINGS_KEY, JSON.stringify(settings)]
  );
}

export async function saveAnalysisRecord(record: AnalysisRecord): Promise<void> {
  const db = await initDb();
  await db.execute(
    `
      INSERT INTO analyses (project_path, analysis_path, updated_at)
      VALUES ($1, $2, $3)
      ON CONFLICT(project_path) DO UPDATE SET
        analysis_path = excluded.analysis_path,
        updated_at = excluded.updated_at;
    `,
    [record.projectPath, record.analysisPath, record.updatedAt]
  );
}

export async function loadAnalysisRecord(projectPath: string): Promise<AnalysisRecord | null> {
  const db = await initDb();
  const rows = await db.select<{ project_path: string; analysis_path: string; updated_at: string }[]>(
    "SELECT project_path, analysis_path, updated_at FROM analyses WHERE project_path = $1",
    [projectPath]
  );

  const row = rows.at(0);
  if (!row) {
    return null;
  }
  return {
    projectPath: row.project_path,
    analysisPath: row.analysis_path,
    updatedAt: row.updated_at
  };
}

export async function deleteProjectData(projectPath: string): Promise<void> {
  const db = await initDb();
  await db.execute("DELETE FROM recent_projects WHERE path = $1", [projectPath]);
  await db.execute("DELETE FROM analyses WHERE project_path = $1", [projectPath]);
}
