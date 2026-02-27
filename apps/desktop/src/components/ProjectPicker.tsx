import { open } from "@tauri-apps/plugin-dialog";
import type { RecentProject } from "../types";

interface ProjectPickerProps {
  selectedProject: string | null;
  recentProjects: RecentProject[];
  onProjectSelected: (projectPath: string) => Promise<void>;
  onProjectDeleted: (projectPath: string) => Promise<void>;
}

export function ProjectPicker({
  selectedProject,
  recentProjects,
  onProjectSelected,
  onProjectDeleted
}: ProjectPickerProps): JSX.Element {
  const pickFolder = async (): Promise<void> => {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Select a source repository"
    });

    if (typeof selection === "string") {
      await onProjectSelected(selection);
    }
  };

  return (
    <section className="panel">
      <h2>Project Picker</h2>
      <p className="panel-subtitle">
        macOS grants access only to folders chosen in this dialog. CCV will only scan inside the selected
        repository.
      </p>
      <p className="panel-subtitle">
        Next step: switch to <strong>Analysis Runner</strong> and click <strong>Run Analysis</strong>.
      </p>

      <button className="button-primary" onClick={pickFolder}>
        Choose Repository Folder
      </button>

      <div className="selected-project">
        <strong>Current:</strong> {selectedProject ?? "No project selected"}
      </div>

      <h3>Recent Projects</h3>
      {recentProjects.length === 0 ? (
        <p className="muted">No recent projects yet.</p>
      ) : (
        <ul className="recent-list">
          {recentProjects.map((project) => (
            <li key={project.path}>
              <button className="link-button" onClick={() => onProjectSelected(project.path)}>
                {project.path}
              </button>
              <span className="timestamp">{project.lastOpened}</span>
              <button
                className="button-danger"
                onClick={() => {
                  void onProjectDeleted(project.path);
                }}
              >
                Delete Data
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
