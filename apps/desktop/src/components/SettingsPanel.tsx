import type { AppSettings } from "../types";

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onSave: () => Promise<void>;
}

const languageOptions = [
  { id: "js", label: "JavaScript" },
  { id: "ts", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "py", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "css", label: "CSS" },
  { id: "html", label: "HTML" }
] as const;

export function SettingsPanel({ settings, onSettingsChange, onSave }: SettingsPanelProps): JSX.Element {
  const updateWeight = (key: keyof AppSettings["weights"], value: string): void => {
    const numeric = Number(value);
    onSettingsChange({
      ...settings,
      weights: {
        ...settings.weights,
        [key]: Number.isFinite(numeric) ? numeric : settings.weights[key]
      }
    });
  };

  const toggleLanguage = (language: (typeof languageOptions)[number]["id"]): void => {
    const includes = settings.languages.includes(language);
    onSettingsChange({
      ...settings,
      languages: includes
        ? settings.languages.filter((entry) => entry !== language)
        : [...settings.languages, language]
    });
  };

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="panel-subtitle">Configure exclusions, weights, and language support.</p>

      <label>
        Exclude Patterns
        <input
          value={settings.excludePatterns.join(",")}
          onChange={(event) =>
            onSettingsChange({
              ...settings,
              excludePatterns: event.target.value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
            })
          }
          placeholder="node_modules,.git,dist,build"
        />
      </label>

      <fieldset>
        <legend>Languages</legend>
        <div className="language-grid">
          {languageOptions.map((option) => (
            <label key={option.id}>
              <input
                type="checkbox"
                checked={settings.languages.includes(option.id)}
                onChange={() => toggleLanguage(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Risk Weights</legend>
        <div className="weight-grid">
          <label>
            LOC
            <input
              type="number"
              step="0.1"
              value={settings.weights.loc}
              onChange={(event) => updateWeight("loc", event.target.value)}
            />
          </label>
          <label>
            Complexity
            <input
              type="number"
              step="0.1"
              value={settings.weights.complexity}
              onChange={(event) => updateWeight("complexity", event.target.value)}
            />
          </label>
          <label>
            Fan-In
            <input
              type="number"
              step="0.1"
              value={settings.weights.fanIn}
              onChange={(event) => updateWeight("fanIn", event.target.value)}
            />
          </label>
          <label>
            Fan-Out
            <input
              type="number"
              step="0.1"
              value={settings.weights.fanOut}
              onChange={(event) => updateWeight("fanOut", event.target.value)}
            />
          </label>
          <label>
            Cycle
            <input
              type="number"
              step="0.1"
              value={settings.weights.cycle}
              onChange={(event) => updateWeight("cycle", event.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <label className="inline">
        <input
          type="checkbox"
          checked={settings.cityViewEnabled}
          onChange={(event) => onSettingsChange({ ...settings, cityViewEnabled: event.target.checked })}
        />
        Enable 3D City View
      </label>

      <button className="button-primary" onClick={() => void onSave()}>
        Save Settings
      </button>
    </section>
  );
}
