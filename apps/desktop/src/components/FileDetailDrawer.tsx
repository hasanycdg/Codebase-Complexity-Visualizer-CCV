import type { AnalysisModel } from "../types";

interface FileDetailDrawerProps {
  model: AnalysisModel;
  selectedPath: string | null;
  onClose: () => void;
}

export function FileDetailDrawer({ model, selectedPath, onClose }: FileDetailDrawerProps): JSX.Element | null {
  if (!selectedPath) {
    return null;
  }

  const file = model.files.find((entry) => entry.path === selectedPath);
  if (!file) {
    return null;
  }

  return (
    <aside className="drawer">
      <div className="drawer-header">
        <h3>File Details</h3>
        <button className="button-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <code className="drawer-path">{file.path}</code>
      <dl>
        <dt>Language</dt>
        <dd>{file.language}</dd>
        <dt>LOC</dt>
        <dd>{file.loc}</dd>
        <dt>Complexity</dt>
        <dd>{file.complexity}</dd>
        <dt>Fan-In</dt>
        <dd>{file.fanIn}</dd>
        <dt>Fan-Out</dt>
        <dd>{file.fanOut}</dd>
        <dt>In Cycle</dt>
        <dd>{file.inCycle ? "Yes" : "No"}</dd>
        <dt>Risk Score</dt>
        <dd>{file.riskScore.toFixed(3)}</dd>
      </dl>

      <h4>Imports</h4>
      {file.imports.length === 0 ? (
        <p className="muted">No imports found.</p>
      ) : (
        <ul className="import-list">
          {file.imports.map((entry, index) => (
            <li key={`${entry.specifier}-${index}`}>
              <code>{entry.specifier}</code>
              <span>{entry.resolvedPath ?? (entry.external ? "External" : "Unresolved relative")}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
