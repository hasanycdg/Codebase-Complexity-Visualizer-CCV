import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnalysisRunner } from "./components/AnalysisRunner";
import { Dashboard } from "./components/Dashboard";
import { ProjectPicker } from "./components/ProjectPicker";
import { SettingsPanel } from "./components/SettingsPanel";
import appLogo from "../src-tauri/icons/icon.png";
import {
  deleteProjectData,
  listRecentProjects,
  loadAnalysisRecord,
  loadSettings,
  saveAnalysisRecord,
  saveRecentProject,
  saveSettings
} from "./lib/db";
import { readAnalysis, runAnalysis } from "./lib/tauri";
import {
  DEFAULT_SETTINGS,
  type AnalysisDoneEvent,
  type AnalysisErrorEvent,
  type AnalysisLogEvent,
  type AnalysisModel,
  type AppSettings,
  type RecentProject
} from "./types";

type Screen = "picker" | "runner" | "dashboard" | "settings";

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>("picker");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [analysis, setAnalysis] = useState<AnalysisModel | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const currentRunId = useRef<string | null>(null);

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      const [loadedSettings, recents] = await Promise.all([loadSettings(), listRecentProjects()]);
      setSettings(loadedSettings);
      setRecentProjects(recents);
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let disposed = false;

    const trackUnlistener = (unlisten: () => void): void => {
      if (disposed) {
        unlisten();
        return;
      }
      unlisteners.push(unlisten);
    };

    const subscribe = async (): Promise<void> => {
      const unlistenLog = await listen<AnalysisLogEvent>("analysis-log", (event) => {
        if (event.payload.runId !== currentRunId.current) {
          return;
        }

        const prefix = event.payload.level === "stderr" ? "[stderr]" : "[stdout]";
        setLogs((previous) => [...previous, `${prefix} ${event.payload.message}`]);
      });

      const unlistenDone = await listen<AnalysisDoneEvent>("analysis-done", (event) => {
        if (event.payload.runId !== currentRunId.current) {
          return;
        }

        setIsRunning(false);
        setLogs((previous) => [
          ...previous,
          `[ccv] analysis finished with exit code ${event.payload.exitCode}`
        ]);

        if (!event.payload.success) {
          return;
        }

        void (async () => {
          try {
            const loadedAnalysis = await readAnalysis(event.payload.outputPath);
            setAnalysis(loadedAnalysis);
            setScreen("dashboard");
            setLogs((previous) => [
              ...previous,
              `[ccv] loaded analysis model (${loadedAnalysis.files.length} files)`
            ]);
          } catch (error) {
            setLogs((previous) => [
              ...previous,
              `[ccv] failed to load analysis.json: ${String(error)}`
            ]);
            return;
          }

          try {
            await saveAnalysisRecord({
              projectPath: event.payload.repoPath,
              analysisPath: event.payload.outputPath,
              updatedAt: new Date().toISOString()
            });
            const recents = await listRecentProjects();
            setRecentProjects(recents);
          } catch (error) {
            setLogs((previous) => [
              ...previous,
              `[ccv] warning: analysis loaded, but metadata persistence failed: ${String(error)}`
            ]);
          }
        })();
      });

      const unlistenError = await listen<AnalysisErrorEvent>("analysis-error", (event) => {
        if (event.payload.runId !== currentRunId.current) {
          return;
        }

        setIsRunning(false);
        setLogs((previous) => [...previous, `[ccv] ${event.payload.message}`]);
      });

      trackUnlistener(unlistenLog);
      trackUnlistener(unlistenDone);
      trackUnlistener(unlistenError);
    };

    void subscribe();

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  const refreshRecentProjects = async (): Promise<void> => {
    const recents = await listRecentProjects();
    setRecentProjects(recents);
  };

  const handleProjectSelected = async (projectPath: string): Promise<void> => {
    setSelectedProject(projectPath);
    setLogs([`[ccv] project selected: ${projectPath}`]);
    setSelectedFilePath(null);
    setScreen("runner");

    try {
      await saveRecentProject(projectPath);
      await refreshRecentProjects();
    } catch (error) {
      setLogs((previous) => [
        ...previous,
        `[ccv] warning: could not persist recent project list: ${String(error)}`
      ]);
    }

    let record: Awaited<ReturnType<typeof loadAnalysisRecord>> = null;
    try {
      record = await loadAnalysisRecord(projectPath);
    } catch (error) {
      setAnalysis(null);
      setLogs((previous) => [
        ...previous,
        `[ccv] warning: could not read previous analysis record: ${String(error)}`
      ]);
      return;
    }

    if (!record) {
      setAnalysis(null);
      setLogs((previous) => [
        ...previous,
        "[ccv] no previous analysis found. Open 'Analysis Runner' and click 'Run Analysis'."
      ]);
      return;
    }

    try {
      const loadedAnalysis = await readAnalysis(record.analysisPath);
      setAnalysis(loadedAnalysis);
      setLogs((previous) => [...previous, `[ccv] loaded existing analysis: ${record.analysisPath}`]);
    } catch {
      setAnalysis(null);
      setLogs((previous) => [
        ...previous,
        "[ccv] previous analysis file could not be loaded. Run analysis again."
      ]);
    }
  };

  const handleProjectDeleted = async (projectPath: string): Promise<void> => {
    await deleteProjectData(projectPath);
    if (selectedProject === projectPath) {
      setSelectedProject(null);
      setAnalysis(null);
      setSelectedFilePath(null);
      setLogs([]);
    }
    await refreshRecentProjects();
  };

  const handleRunAnalysis = async (): Promise<void> => {
    if (!selectedProject || isRunning) {
      return;
    }

    const runId = crypto.randomUUID();
    currentRunId.current = runId;

    const outputPath = `${selectedProject}/.ccv/analysis.json`;
    setIsRunning(true);
    setLogs([`[ccv] starting analysis for ${selectedProject}`]);

    try {
      await runAnalysis({
        runId,
        repoPath: selectedProject,
        outPath: outputPath,
        languages: settings.languages,
        excludePatterns: settings.excludePatterns,
        weights: settings.weights
      });
    } catch (error) {
      setIsRunning(false);
      setLogs((previous) => [...previous, `[ccv] failed to spawn analyzer: ${String(error)}`]);
    }
  };

  const handleSaveSettings = async (): Promise<void> => {
    await saveSettings(settings);
    setLogs((previous) => [...previous, "[ccv] settings saved"]);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img className="brand-logo" src={appLogo} alt="Codebase Complexity Visualizer logo" />
          <div>
            <h1>Codebase Complexity Visualizer</h1>
            <p>Local-first architecture analysis for macOS repositories</p>
          </div>
        </div>

        <nav>
          <button className={screen === "picker" ? "tab active" : "tab"} onClick={() => setScreen("picker")}>
            Project Picker
          </button>
          <button className={screen === "runner" ? "tab active" : "tab"} onClick={() => setScreen("runner")}>
            Analysis Runner
          </button>
          <button className={screen === "dashboard" ? "tab active" : "tab"} onClick={() => setScreen("dashboard")}>
            Dashboard
          </button>
          <button
            className={screen === "settings" ? "tab active" : "tab"}
            onClick={() => setScreen("settings")}
          >
            Settings
          </button>
        </nav>
      </header>

      {screen === "picker" ? (
        <ProjectPicker
          selectedProject={selectedProject}
          recentProjects={recentProjects}
          onProjectSelected={handleProjectSelected}
          onProjectDeleted={handleProjectDeleted}
        />
      ) : null}

      {screen === "runner" ? (
        <AnalysisRunner canRun={Boolean(selectedProject)} isRunning={isRunning} onRun={handleRunAnalysis} logs={logs} />
      ) : null}

      {screen === "dashboard" ? (
        <Dashboard
          model={analysis}
          selectedFilePath={selectedFilePath}
          onFileSelected={setSelectedFilePath}
          onCloseDrawer={() => setSelectedFilePath(null)}
          cityViewEnabled={settings.cityViewEnabled}
        />
      ) : null}

      {screen === "settings" ? (
        <SettingsPanel settings={settings} onSettingsChange={setSettings} onSave={handleSaveSettings} />
      ) : null}
    </main>
  );
}
