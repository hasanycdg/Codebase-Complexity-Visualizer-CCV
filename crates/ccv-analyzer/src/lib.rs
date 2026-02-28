mod import_parser;
mod text;

use std::{
    collections::{BTreeSet, HashMap, HashSet},
    env, fs,
    io::Write,
    path::{Component, Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use globset::{Glob, GlobMatcher};
use regex::Regex;
use serde::{Deserialize, Serialize};
use walkdir::{DirEntry, WalkDir};

use self::{
    import_parser::{
        parse_css_imports, parse_html_imports, parse_java_imports, parse_js_ts_imports,
        parse_php_imports, parse_python_imports,
    },
    text::strip_comments,
};

const DEFAULT_EXCLUDES: &[&str] = &["node_modules", ".git", "dist", "build"];
const RESOLVABLE_EXTENSIONS: &[&str] = &[
    ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".java",
    ".php", ".phtml", ".css", ".html", ".htm",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Js,
    Ts,
    Java,
    Py,
    Php,
    Css,
    Html,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskWeights {
    pub loc: f64,
    pub complexity: f64,
    pub fan_in: f64,
    pub fan_out: f64,
    pub cycle: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisConfig {
    pub languages: Vec<Language>,
    pub exclude: Vec<String>,
    pub weights: RiskWeights,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRef {
    pub specifier: String,
    pub resolved_path: Option<String>,
    pub external: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAnalysis {
    pub path: String,
    pub language: Language,
    pub loc: u64,
    pub complexity: u64,
    pub fan_in: u64,
    pub fan_out: u64,
    pub in_cycle: bool,
    pub risk_score: f64,
    pub imports: Vec<ImportRef>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyEdge {
    pub from: String,
    pub to: String,
    pub specifier: String,
    pub external: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StronglyConnectedComponent {
    pub id: usize,
    pub size: usize,
    pub nodes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSummary {
    pub file_count: usize,
    pub dependency_count: usize,
    pub cycle_count: usize,
    pub scc_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisModel {
    pub schema_version: &'static str,
    pub generated_at: String,
    pub root_path: String,
    pub config: AnalysisConfig,
    pub summary: AnalysisSummary,
    pub files: Vec<FileAnalysis>,
    pub edges: Vec<DependencyEdge>,
    pub scc: Vec<StronglyConnectedComponent>,
}

#[derive(Debug, Clone)]
pub struct AnalyzeOptions {
    pub repo_path: PathBuf,
    pub out_path: PathBuf,
    pub languages: Vec<Language>,
    pub exclude_patterns: Vec<String>,
    pub weights: RiskWeights,
}

#[derive(Debug, Clone)]
struct FileInterim {
    rel_path: String,
    language: Language,
    loc: u64,
    complexity: u64,
    imports: Vec<ImportRef>,
}

#[derive(Debug)]
enum ExcludePattern {
    Plain(String),
    Glob {
        direct: GlobMatcher,
        nested: GlobMatcher,
    },
}

pub fn default_languages() -> Vec<Language> {
    vec![
        Language::Js,
        Language::Ts,
        Language::Java,
        Language::Py,
        Language::Php,
        Language::Css,
        Language::Html,
    ]
}

pub fn default_weights() -> RiskWeights {
    RiskWeights {
        loc: 0.8,
        complexity: 1.4,
        fan_in: 1.0,
        fan_out: 1.0,
        cycle: 2.5,
    }
}

fn print_usage() {
    println!(
        "\nUsage:\n  ccv-analyzer analyze <repoPath> --out analysis.json\n\nOptions:\n  --languages js,ts,java,py,php,css,html\n  --exclude node_modules,.git,dist,build\n  --weights loc=0.8,complexity=1.4,fanIn=1,fanOut=1,cycle=2.5\n"
    );
}

pub fn run_cli(args: &[String]) -> Result<(), String> {
    if args.is_empty() || args[0] == "--help" || args[0] == "-h" {
        print_usage();
        return Ok(());
    }

    if args[0] != "analyze" {
        return Err(format!("Unknown command: {}", args[0]));
    }

    let options = parse_analyze_args(args)?;
    analyze_repository(&options, |line| println!("{line}"))?;
    Ok(())
}

fn parse_analyze_args(args: &[String]) -> Result<AnalyzeOptions, String> {
    if args.len() < 2 {
        return Err("Missing repoPath".to_string());
    }

    let repo_path = resolve_path(Path::new(&args[1]))?;
    let mut out_path: Option<PathBuf> = None;
    let mut languages_raw: Option<String> = None;
    let mut exclude_raw: Option<String> = None;
    let mut weights_raw: Option<String> = None;

    let mut index = 2usize;
    while index < args.len() {
        let option = &args[index];

        if option.starts_with("--out") {
            let (value, next_index) = parse_option_value(args, index)?;
            out_path = Some(resolve_path(Path::new(&value))?);
            index = next_index;
            continue;
        }

        if option.starts_with("--languages") {
            let (value, next_index) = parse_option_value(args, index)?;
            languages_raw = Some(value);
            index = next_index;
            continue;
        }

        if option.starts_with("--exclude") {
            let (value, next_index) = parse_option_value(args, index)?;
            exclude_raw = Some(value);
            index = next_index;
            continue;
        }

        if option.starts_with("--weights") {
            let (value, next_index) = parse_option_value(args, index)?;
            weights_raw = Some(value);
            index = next_index;
            continue;
        }

        return Err(format!("Unknown option: {option}"));
    }

    let out_path = out_path.ok_or_else(|| "The --out option is required.".to_string())?;
    let languages = parse_languages(languages_raw.as_deref())?;
    let exclude_patterns = if let Some(raw) = exclude_raw {
        raw.split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .collect()
    } else {
        DEFAULT_EXCLUDES.iter().map(|value| value.to_string()).collect()
    };

    Ok(AnalyzeOptions {
        repo_path,
        out_path,
        languages,
        exclude_patterns,
        weights: parse_weights(weights_raw.as_deref())?,
    })
}

fn parse_option_value(args: &[String], index: usize) -> Result<(String, usize), String> {
    let token = args
        .get(index)
        .ok_or_else(|| "Missing option token".to_string())?;

    if !token.starts_with("--") {
        return Err(format!("Unexpected option token: {token}"));
    }

    if let Some(equal_index) = token.find('=') {
        return Ok((token[equal_index + 1..].to_string(), index + 1));
    }

    let value = args
        .get(index + 1)
        .ok_or_else(|| format!("Missing value for {token}"))?;
    if value.starts_with("--") {
        return Err(format!("Missing value for {token}"));
    }

    Ok((value.clone(), index + 2))
}

fn parse_weights(raw: Option<&str>) -> Result<RiskWeights, String> {
    let mut merged = default_weights();
    let Some(raw) = raw else {
        return Ok(merged);
    };

    for pair in raw.split(',') {
        let (key, value) = pair
            .split_once('=')
            .ok_or_else(|| format!("Invalid --weights token: {pair}"))?;
        let numeric = value
            .trim()
            .parse::<f64>()
            .map_err(|_| format!("Invalid numeric weight for {}: {}", key.trim(), value.trim()))?;

        match key.trim() {
            "loc" => merged.loc = numeric,
            "complexity" => merged.complexity = numeric,
            "fanIn" => merged.fan_in = numeric,
            "fanOut" => merged.fan_out = numeric,
            "cycle" => merged.cycle = numeric,
            other => return Err(format!("Unknown weight key: {other}")),
        }
    }

    Ok(merged)
}

pub fn parse_languages(raw: Option<&str>) -> Result<Vec<Language>, String> {
    let Some(raw) = raw else {
        return Ok(default_languages());
    };

    let mut parsed = Vec::new();
    let mut seen = BTreeSet::new();

    for token in raw.split(',').map(str::trim).filter(|value| !value.is_empty()) {
        let normalized = match token.to_ascii_lowercase().as_str() {
            "js" | "javascript" => Language::Js,
            "ts" | "typescript" => Language::Ts,
            "java" => Language::Java,
            "py" | "python" => Language::Py,
            "php" => Language::Php,
            "css" => Language::Css,
            "html" | "hypertext" => Language::Html,
            _ => continue,
        };

        if seen.insert(normalized) {
            parsed.push(normalized);
        }
    }

    if parsed.is_empty() {
        return Err(format!("No supported language in --languages={raw}"));
    }

    Ok(parsed)
}

pub fn analyze_repository<F>(
    options: &AnalyzeOptions,
    mut logger: F,
) -> Result<AnalysisModel, String>
where
    F: FnMut(&str),
{
    let root_path = resolve_path(&options.repo_path)?;
    let out_path = resolve_path(&options.out_path)?;

    logger(&format!("[ccv] Scanning: {}", root_path.display()));

    let files = scan_repository(&root_path, &options.languages, &options.exclude_patterns)?;
    logger(&format!("[ccv] Source files found: {}", files.len()));

    let known_files: HashSet<PathBuf> = files.iter().cloned().collect();
    let mut interim_files = Vec::new();

    for abs_path in &files {
        let rel_path = to_posix_path(
            &abs_path
                .strip_prefix(&root_path)
                .map_err(|error| format!("Failed to compute relative path: {error}"))?
                .to_path_buf(),
        );

        let language = detect_language(abs_path)
            .ok_or_else(|| format!("Unsupported file extension: {}", abs_path.display()))?;
        let source = fs::read_to_string(abs_path)
            .map_err(|error| format!("Failed to read {}: {error}", abs_path.display()))?;
        let loc = count_loc(&source);
        let complexity = approximate_cyclomatic_complexity(&source);
        let allow_implicit_relative = allows_implicit_relative_specifiers(language);
        let imports = parse_imports_by_language(language, &source)
            .into_iter()
            .map(|specifier| {
                let resolved_absolute_path = resolve_relative_import(
                    abs_path,
                    &specifier,
                    &known_files,
                    &root_path,
                    allow_implicit_relative,
                );
                let resolved_path = resolved_absolute_path
                    .as_ref()
                    .map(|value| to_posix_path(&value.strip_prefix(&root_path).unwrap_or(value).to_path_buf()));
                let external = resolved_path.is_none()
                    && !is_relative_specifier(&specifier, allow_implicit_relative);

                ImportRef {
                    specifier,
                    resolved_path,
                    external,
                }
            })
            .collect::<Vec<_>>();

        interim_files.push(FileInterim {
            rel_path,
            language,
            loc,
            complexity,
            imports,
        });
    }

    let mut adjacency: HashMap<String, BTreeSet<String>> = HashMap::new();
    for file in &interim_files {
        adjacency.insert(file.rel_path.clone(), BTreeSet::new());
    }

    let mut edges = Vec::new();
    let mut edge_ids = HashSet::new();

    for file in &interim_files {
        for entry in &file.imports {
            if let Some(resolved_path) = &entry.resolved_path {
                adjacency
                    .entry(file.rel_path.clone())
                    .or_default()
                    .insert(resolved_path.clone());

                let id = format!("{}->{}->{}", file.rel_path, resolved_path, entry.specifier);
                if edge_ids.insert(id) {
                    edges.push(DependencyEdge {
                        from: file.rel_path.clone(),
                        to: resolved_path.clone(),
                        specifier: entry.specifier.clone(),
                        external: false,
                    });
                }
            } else if entry.external {
                let id = format!("{}->{}->external", file.rel_path, entry.specifier);
                if edge_ids.insert(id) {
                    edges.push(DependencyEdge {
                        from: file.rel_path.clone(),
                        to: entry.specifier.clone(),
                        specifier: entry.specifier.clone(),
                        external: true,
                    });
                }
            }
        }
    }

    let mut node_ids = interim_files
        .iter()
        .map(|file| file.rel_path.clone())
        .collect::<Vec<_>>();
    node_ids.sort();

    let all_scc = tarjan_scc(&node_ids, &adjacency);

    let mut cycle_nodes = HashSet::new();
    let mut scc = Vec::new();
    for (index, nodes) in all_scc.iter().enumerate() {
        let has_self_loop = nodes.len() == 1
            && nodes
                .first()
                .and_then(|node| adjacency.get(node).map(|neighbors| neighbors.contains(node)))
                .unwrap_or(false);

        if nodes.len() > 1 || has_self_loop {
            for node in nodes {
                cycle_nodes.insert(node.clone());
            }
        }

        scc.push(StronglyConnectedComponent {
            id: index + 1,
            size: nodes.len(),
            nodes: nodes.clone(),
        });
    }

    let mut fan_in_map: HashMap<String, u64> = HashMap::new();
    let mut fan_out_map: HashMap<String, u64> = HashMap::new();
    for file in &interim_files {
        fan_in_map.insert(file.rel_path.clone(), 0);
        fan_out_map.insert(
            file.rel_path.clone(),
            adjacency.get(&file.rel_path).map(|value| value.len() as u64).unwrap_or(0),
        );
    }

    for edge in &edges {
        if !edge.external {
            *fan_in_map.entry(edge.to.clone()).or_insert(0) += 1;
        }
    }

    let mut file_analyses = interim_files
        .iter()
        .map(|file| {
            let fan_in = *fan_in_map.get(&file.rel_path).unwrap_or(&0);
            let fan_out = *fan_out_map.get(&file.rel_path).unwrap_or(&0);
            let in_cycle = cycle_nodes.contains(&file.rel_path);
            let risk_score = round_metric(calculate_risk_score(
                file.loc,
                file.complexity,
                fan_in,
                fan_out,
                in_cycle,
                &options.weights,
            ));

            FileAnalysis {
                path: file.rel_path.clone(),
                language: file.language,
                loc: file.loc,
                complexity: file.complexity,
                fan_in,
                fan_out,
                in_cycle,
                risk_score,
                imports: file.imports.clone(),
            }
        })
        .collect::<Vec<_>>();
    file_analyses.sort_by(|a, b| a.path.cmp(&b.path));

    let cycle_count = scc
        .iter()
        .filter(|component| {
            if component.size > 1 {
                return true;
            }
            component
                .nodes
                .first()
                .and_then(|node| adjacency.get(node).map(|neighbors| neighbors.contains(node)))
                .unwrap_or(false)
        })
        .count();

    edges.sort_by(|a, b| a.from.cmp(&b.from).then(a.to.cmp(&b.to)));

    let model = AnalysisModel {
        schema_version: "1.0.0",
        generated_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        root_path: root_path.display().to_string(),
        config: AnalysisConfig {
            languages: options.languages.clone(),
            exclude: options.exclude_patterns.clone(),
            weights: options.weights.clone(),
        },
        summary: AnalysisSummary {
            file_count: file_analyses.len(),
            dependency_count: edges.len(),
            cycle_count,
            scc_count: scc.len(),
        },
        files: file_analyses,
        edges,
        scc,
    };

    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create output directory {}: {error}", parent.display()))?;
    }

    let mut output_file = fs::File::create(&out_path)
        .map_err(|error| format!("Failed to create analysis output {}: {error}", out_path.display()))?;
    let serialized = serde_json::to_string_pretty(&model)
        .map_err(|error| format!("Failed to serialize analysis model: {error}"))?;
    writeln!(output_file, "{serialized}")
        .map_err(|error| format!("Failed to write analysis output {}: {error}", out_path.display()))?;

    logger(&format!("[ccv] Analysis written to: {}", out_path.display()));
    Ok(model)
}

fn resolve_path(path: &Path) -> Result<PathBuf, String> {
    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir()
            .map_err(|error| format!("Failed to read current directory: {error}"))?
            .join(path)
    };

    Ok(normalize_path(&resolved))
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized
}

fn to_posix_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn detect_language(path: &Path) -> Option<Language> {
    match path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()) {
        Some(ext) if ["js", "jsx", "mjs", "cjs"].contains(&ext.as_str()) => Some(Language::Js),
        Some(ext) if ["ts", "tsx", "mts", "cts"].contains(&ext.as_str()) => Some(Language::Ts),
        Some(ext) if ext == "java" => Some(Language::Java),
        Some(ext) if ext == "py" => Some(Language::Py),
        Some(ext) if ["php", "phtml", "php5"].contains(&ext.as_str()) => Some(Language::Php),
        Some(ext) if ext == "css" => Some(Language::Css),
        Some(ext) if ["html", "htm"].contains(&ext.as_str()) => Some(Language::Html),
        _ => None,
    }
}

fn allowed_extensions(languages: &[Language]) -> HashSet<&'static str> {
    let mut allowed = HashSet::new();
    for language in languages {
        match language {
            Language::Js => {
                allowed.extend(["js", "jsx", "mjs", "cjs"]);
            }
            Language::Ts => {
                allowed.extend(["ts", "tsx", "mts", "cts"]);
            }
            Language::Java => {
                allowed.insert("java");
            }
            Language::Py => {
                allowed.insert("py");
            }
            Language::Php => {
                allowed.extend(["php", "phtml", "php5"]);
            }
            Language::Css => {
                allowed.insert("css");
            }
            Language::Html => {
                allowed.extend(["html", "htm"]);
            }
        }
    }
    allowed
}

fn has_glob(pattern: &str) -> bool {
    pattern.chars().any(|ch| matches!(ch, '*' | '?' | '[' | ']' | '{' | '}'))
}

fn build_exclude_patterns(patterns: &[String]) -> Result<Vec<ExcludePattern>, String> {
    let mut compiled = Vec::new();
    for raw_pattern in patterns {
        let pattern = raw_pattern.trim();
        if pattern.is_empty() {
            continue;
        }

        if has_glob(pattern) {
            let direct = Glob::new(pattern)
                .map_err(|error| format!("Invalid exclude pattern {pattern}: {error}"))?
                .compile_matcher();
            let nested = Glob::new(&format!("**/{pattern}"))
                .map_err(|error| format!("Invalid exclude pattern {pattern}: {error}"))?
                .compile_matcher();
            compiled.push(ExcludePattern::Glob { direct, nested });
        } else {
            compiled.push(ExcludePattern::Plain(pattern.to_string()));
        }
    }

    Ok(compiled)
}

fn should_exclude_path(relative_path: &Path, patterns: &[ExcludePattern]) -> bool {
    let normalized = to_posix_path(relative_path);
    let segments = normalized
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    for pattern in patterns {
        match pattern {
            ExcludePattern::Plain(value) => {
                if normalized == *value
                    || normalized.starts_with(&format!("{value}/"))
                    || segments.iter().any(|segment| *segment == value)
                {
                    return true;
                }
            }
            ExcludePattern::Glob { direct, nested } => {
                if direct.is_match(&normalized) || nested.is_match(&normalized) {
                    return true;
                }
            }
        }
    }

    false
}

fn scan_repository(
    root_path: &Path,
    languages: &[Language],
    exclude_patterns: &[String],
) -> Result<Vec<PathBuf>, String> {
    let allowed = allowed_extensions(languages);
    let compiled_patterns = build_exclude_patterns(exclude_patterns)?;

    let filter_entry = |entry: &DirEntry| {
        if entry.path() == root_path {
            return true;
        }

        let Ok(relative_path) = entry.path().strip_prefix(root_path) else {
            return true;
        };

        !should_exclude_path(relative_path, &compiled_patterns)
    };

    let mut results = Vec::new();
    for entry in WalkDir::new(root_path)
        .into_iter()
        .filter_entry(filter_entry)
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        let Some(extension) = extension else {
            continue;
        };
        if !allowed.contains(extension.as_str()) {
            continue;
        }

        let Some(language) = detect_language(entry.path()) else {
            continue;
        };
        if !languages.contains(&language) {
            continue;
        }

        results.push(normalize_path(entry.path()));
    }

    results.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    Ok(results)
}

fn count_loc(source: &str) -> u64 {
    source
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .count() as u64
}

fn approximate_cyclomatic_complexity(source: &str) -> u64 {
    let stripped = strip_comments(source);
    if stripped.trim().is_empty() {
        return 0;
    }

    let patterns = [
        Regex::new(r"\bif\b").expect("valid if regex"),
        Regex::new(r"\bfor\b").expect("valid for regex"),
        Regex::new(r"\bwhile\b").expect("valid while regex"),
        Regex::new(r"\bcase\b").expect("valid case regex"),
        Regex::new(r"\bcatch\b").expect("valid catch regex"),
        Regex::new(r"\?[^:]").expect("valid ternary regex"),
        Regex::new(r"&&").expect("valid and regex"),
        Regex::new(r"\|\|").expect("valid or regex"),
    ];

    let mut complexity = 1u64;
    for pattern in patterns {
        complexity += pattern.find_iter(&stripped).count() as u64;
    }

    complexity
}

fn parse_imports_by_language(language: Language, source: &str) -> Vec<String> {
    match language {
        Language::Js | Language::Ts => parse_js_ts_imports(source),
        Language::Java => parse_java_imports(source),
        Language::Py => parse_python_imports(source),
        Language::Php => parse_php_imports(source),
        Language::Css => parse_css_imports(source),
        Language::Html => parse_html_imports(source),
    }
}

fn allows_implicit_relative_specifiers(language: Language) -> bool {
    matches!(language, Language::Php | Language::Css | Language::Html)
}

fn strip_query_and_hash(specifier: &str) -> String {
    specifier
        .split('#')
        .next()
        .unwrap_or_default()
        .split('?')
        .next()
        .unwrap_or_default()
        .to_string()
}

fn is_external_like(specifier: &str) -> bool {
    let scheme_pattern = Regex::new(r"^[A-Za-z][A-Za-z0-9+.-]*:").expect("valid scheme regex");
    scheme_pattern.is_match(specifier) || specifier.starts_with("//") || specifier.starts_with('#')
}

fn is_relative_specifier(specifier: &str, allow_implicit_relative: bool) -> bool {
    let sanitized = strip_query_and_hash(specifier).trim().to_string();
    if sanitized.is_empty() {
        return false;
    }

    if sanitized.starts_with("./") || sanitized.starts_with("../") || sanitized.starts_with('/') {
        return true;
    }

    allow_implicit_relative && !is_external_like(&sanitized)
}

fn resolve_relative_import(
    importer_absolute_path: &Path,
    specifier: &str,
    known_files: &HashSet<PathBuf>,
    root_path: &Path,
    allow_implicit_relative: bool,
) -> Option<PathBuf> {
    let sanitized = strip_query_and_hash(specifier).trim().to_string();
    if !is_relative_specifier(&sanitized, allow_implicit_relative) {
        return None;
    }

    let base = if sanitized.starts_with('/') {
        root_path.join(sanitized.trim_start_matches('/'))
    } else {
        importer_absolute_path
            .parent()
            .unwrap_or(root_path)
            .join(&sanitized)
    };

    let mut candidates = Vec::new();
    candidates.push(normalize_path(&base));

    for extension in RESOLVABLE_EXTENSIONS {
        candidates.push(normalize_path(&PathBuf::from(format!("{}{}", base.display(), extension))));
        candidates.push(normalize_path(&base.join(format!("index{extension}"))));
    }

    candidates.into_iter().find(|candidate| known_files.contains(candidate))
}

fn calculate_risk_score(
    loc: u64,
    complexity: u64,
    fan_in: u64,
    fan_out: u64,
    in_cycle: bool,
    weights: &RiskWeights,
) -> f64 {
    let loc_norm = (1.0 + loc as f64).ln();
    let complexity_norm = (1.0 + complexity as f64).ln();
    let fan_in_norm = (1.0 + fan_in as f64).ln();
    let fan_out_norm = (1.0 + fan_out as f64).ln();

    weights.loc * loc_norm
        + weights.complexity * complexity_norm
        + weights.fan_in * fan_in_norm
        + weights.fan_out * fan_out_norm
        + weights.cycle * if in_cycle { 1.0 } else { 0.0 }
}

fn round_metric(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn tarjan_scc(
    nodes: &[String],
    adjacency: &HashMap<String, BTreeSet<String>>,
) -> Vec<Vec<String>> {
    fn visit(
        node: &str,
        adjacency: &HashMap<String, BTreeSet<String>>,
        index: &mut usize,
        index_map: &mut HashMap<String, usize>,
        low_link: &mut HashMap<String, usize>,
        stack: &mut Vec<String>,
        in_stack: &mut HashSet<String>,
        components: &mut Vec<Vec<String>>,
    ) {
        index_map.insert(node.to_string(), *index);
        low_link.insert(node.to_string(), *index);
        *index += 1;
        stack.push(node.to_string());
        in_stack.insert(node.to_string());

        if let Some(edges) = adjacency.get(node) {
            for neighbor in edges {
                if !index_map.contains_key(neighbor) {
                    visit(
                        neighbor,
                        adjacency,
                        index,
                        index_map,
                        low_link,
                        stack,
                        in_stack,
                        components,
                    );
                    let current_low = *low_link.get(node).unwrap_or(&0);
                    let neighbor_low = *low_link.get(neighbor).unwrap_or(&0);
                    low_link.insert(node.to_string(), current_low.min(neighbor_low));
                } else if in_stack.contains(neighbor) {
                    let current_low = *low_link.get(node).unwrap_or(&0);
                    let neighbor_index = *index_map.get(neighbor).unwrap_or(&0);
                    low_link.insert(node.to_string(), current_low.min(neighbor_index));
                }
            }
        }

        if low_link.get(node) == index_map.get(node) {
            let mut component = Vec::new();
            while let Some(top) = stack.pop() {
                in_stack.remove(&top);
                component.push(top.clone());
                if top == node {
                    break;
                }
            }
            component.sort();
            components.push(component);
        }
    }

    let mut index = 0usize;
    let mut index_map = HashMap::new();
    let mut low_link = HashMap::new();
    let mut stack = Vec::new();
    let mut in_stack = HashSet::new();
    let mut components = Vec::new();

    for node in nodes {
        if !index_map.contains_key(node) {
            visit(
                node,
                adjacency,
                &mut index,
                &mut index_map,
                &mut low_link,
                &mut stack,
                &mut in_stack,
                &mut components,
            );
        }
    }

    components.sort_by(|a, b| b.len().cmp(&a.len()).then(a.first().cmp(&b.first())));
    components
}

#[cfg(test)]
mod tests {
    use super::{analyze_repository, default_weights, parse_languages, AnalyzeOptions};
    use std::{env, fs, path::PathBuf, process};

    #[test]
    fn parses_language_aliases() {
        assert_eq!(
            parse_languages(Some("javascript,typescript,python,html")).unwrap().len(),
            4
        );
    }

    #[test]
    fn analyzes_sample_repository_with_expected_summary() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let repo_path = manifest_dir.join("../../fixtures/sample-repo");
        let out_path = env::temp_dir().join(format!("ccv-native-analyzer-test-{}.json", process::id()));

        let options = AnalyzeOptions {
            repo_path,
            out_path: out_path.clone(),
            languages: parse_languages(Some("js,ts")).unwrap(),
            exclude_patterns: vec![
                "node_modules".to_string(),
                ".git".to_string(),
                "dist".to_string(),
                "build".to_string(),
            ],
            weights: default_weights(),
        };

        let model = analyze_repository(&options, |_| {}).unwrap();
        assert_eq!(model.summary.file_count, 3);
        assert_eq!(model.summary.dependency_count, 3);
        assert_eq!(model.summary.cycle_count, 0);
        assert_eq!(model.summary.scc_count, 3);

        let _ = fs::remove_file(out_path);
    }
}
