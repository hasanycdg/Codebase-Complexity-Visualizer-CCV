interface AnalysisRunnerProps {
  canRun: boolean;
  isRunning: boolean;
  onRun: () => Promise<void>;
  logs: string[];
}

export function AnalysisRunner({ canRun, isRunning, onRun, logs }: AnalysisRunnerProps): JSX.Element {
  return (
    <section className="panel">
      <h2>Analysis Runner</h2>
      <p className="panel-subtitle">
        Analyzer runs as a separate process to keep the UI responsive. Logs stream in real-time.
      </p>

      <button className="button-primary" disabled={!canRun || isRunning} onClick={() => void onRun()}>
        {isRunning ? "Running..." : "Run Analysis"}
      </button>

      <div className="log-panel" role="log" aria-live="polite">
        {logs.length === 0 ? <span className="muted">No logs yet.</span> : logs.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </section>
  );
}
