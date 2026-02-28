use regex::Regex;

use super::text::{read_string_literal, skip_whitespace_and_comments, starts_with_token};

struct ParseResult {
    next_index: usize,
    specifier: Option<String>,
}

fn scan_to_boundary(chars: &[char], start: usize) -> usize {
    let mut cursor = start;
    let mut depth = 0usize;

    while cursor < chars.len() {
        cursor = skip_whitespace_and_comments(chars, cursor);
        if cursor >= chars.len() {
            return cursor;
        }

        let current = chars[cursor];
        if current == '"' || current == '\'' || current == '`' {
            cursor = read_string_literal(chars, cursor).end;
            continue;
        }

        if current == '(' || current == '{' || current == '[' {
            depth += 1;
            cursor += 1;
            continue;
        }

        if current == ')' || current == '}' || current == ']' {
            depth = depth.saturating_sub(1);
            cursor += 1;
            continue;
        }

        if (current == ';' || current == '\n') && depth == 0 {
            return cursor + 1;
        }

        cursor += 1;
    }

    chars.len()
}

fn parse_import(chars: &[char], start: usize) -> ParseResult {
    let mut cursor = skip_whitespace_and_comments(chars, start + "import".len());

    if chars.get(cursor) == Some(&'(') {
        cursor = skip_whitespace_and_comments(chars, cursor + 1);
        if matches!(chars.get(cursor), Some('\'') | Some('"')) {
            let literal = read_string_literal(chars, cursor);
            return ParseResult {
                next_index: scan_to_boundary(chars, literal.end),
                specifier: Some(literal.value),
            };
        }

        return ParseResult {
            next_index: scan_to_boundary(chars, cursor),
            specifier: None,
        };
    }

    if matches!(chars.get(cursor), Some('\'') | Some('"')) {
        let literal = read_string_literal(chars, cursor);
        return ParseResult {
            next_index: scan_to_boundary(chars, literal.end),
            specifier: Some(literal.value),
        };
    }

    while cursor < chars.len() {
        cursor = skip_whitespace_and_comments(chars, cursor);
        if cursor >= chars.len() {
            break;
        }

        if starts_with_token(chars, cursor, "from") {
            cursor = skip_whitespace_and_comments(chars, cursor + "from".len());
            if matches!(chars.get(cursor), Some('\'') | Some('"')) {
                let literal = read_string_literal(chars, cursor);
                return ParseResult {
                    next_index: scan_to_boundary(chars, literal.end),
                    specifier: Some(literal.value),
                };
            }

            return ParseResult {
                next_index: scan_to_boundary(chars, cursor),
                specifier: None,
            };
        }

        let current = chars[cursor];
        if current == '"' || current == '\'' || current == '`' {
            cursor = read_string_literal(chars, cursor).end;
            continue;
        }

        if current == ';' || current == '\n' {
            return ParseResult {
                next_index: cursor + 1,
                specifier: None,
            };
        }

        cursor += 1;
    }

    ParseResult {
        next_index: cursor,
        specifier: None,
    }
}

fn parse_export(chars: &[char], start: usize) -> ParseResult {
    let mut cursor = skip_whitespace_and_comments(chars, start + "export".len());

    while cursor < chars.len() {
        cursor = skip_whitespace_and_comments(chars, cursor);
        if cursor >= chars.len() {
            break;
        }

        if starts_with_token(chars, cursor, "from") {
            cursor = skip_whitespace_and_comments(chars, cursor + "from".len());
            if matches!(chars.get(cursor), Some('\'') | Some('"')) {
                let literal = read_string_literal(chars, cursor);
                return ParseResult {
                    next_index: scan_to_boundary(chars, literal.end),
                    specifier: Some(literal.value),
                };
            }

            return ParseResult {
                next_index: scan_to_boundary(chars, cursor),
                specifier: None,
            };
        }

        let current = chars[cursor];
        if current == '"' || current == '\'' || current == '`' {
            cursor = read_string_literal(chars, cursor).end;
            continue;
        }

        if current == ';' || current == '\n' {
            return ParseResult {
                next_index: cursor + 1,
                specifier: None,
            };
        }

        cursor += 1;
    }

    ParseResult {
        next_index: cursor,
        specifier: None,
    }
}

fn parse_require(chars: &[char], start: usize) -> ParseResult {
    let mut cursor = skip_whitespace_and_comments(chars, start + "require".len());
    if chars.get(cursor) != Some(&'(') {
        return ParseResult {
            next_index: cursor.saturating_add(1),
            specifier: None,
        };
    }

    cursor = skip_whitespace_and_comments(chars, cursor + 1);
    if matches!(chars.get(cursor), Some('\'') | Some('"')) {
        let literal = read_string_literal(chars, cursor);
        return ParseResult {
            next_index: scan_to_boundary(chars, literal.end),
            specifier: Some(literal.value),
        };
    }

    ParseResult {
        next_index: scan_to_boundary(chars, cursor),
        specifier: None,
    }
}

fn clean_specifier(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

pub fn parse_js_ts_imports(source: &str) -> Vec<String> {
    let chars: Vec<char> = source.chars().collect();
    let mut imports = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    let mut index = 0usize;

    while index < chars.len() {
        index = skip_whitespace_and_comments(&chars, index);
        if index >= chars.len() {
            break;
        }

        let current = chars[index];
        if current == '"' || current == '\'' || current == '`' {
            index = read_string_literal(&chars, index).end;
            continue;
        }

        let parsed = if starts_with_token(&chars, index, "import") {
            Some(parse_import(&chars, index))
        } else if starts_with_token(&chars, index, "export") {
            Some(parse_export(&chars, index))
        } else if starts_with_token(&chars, index, "require") {
            Some(parse_require(&chars, index))
        } else {
            None
        };

        if let Some(result) = parsed {
            if let Some(specifier) = result.specifier {
                if seen.insert(specifier.clone()) {
                    imports.push(specifier);
                }
            }
            index = result.next_index.max(index + 1);
            continue;
        }

        index += 1;
    }

    imports
}

pub fn parse_java_imports(source: &str) -> Vec<String> {
    let pattern = Regex::new(r"(?m)^\s*import\s+(?:static\s+)?([A-Za-z0-9_.*$]+)\s*;")
        .expect("valid java import regex");
    pattern
        .captures_iter(source)
        .filter_map(|capture| capture.get(1).map(|value| value.as_str().to_string()))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub fn parse_python_imports(source: &str) -> Vec<String> {
    let mut imports = std::collections::BTreeSet::new();

    let import_pattern = Regex::new(r"^\s*import\s+([A-Za-z0-9_.,\s]+)\s*$")
        .expect("valid python import regex");
    let from_pattern = Regex::new(r"^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+[A-Za-z0-9_.*,\s]+$")
        .expect("valid python from regex");

    for line in source.lines() {
        if let Some(capture) = import_pattern.captures(line) {
            if let Some(block) = capture.get(1) {
                for module_name in block.as_str().split(',') {
                    let trimmed = module_name.trim();
                    if !trimmed.is_empty() {
                        imports.insert(trimmed.to_string());
                    }
                }
            }
            continue;
        }

        if let Some(capture) = from_pattern.captures(line) {
            if let Some(module_name) = capture.get(1) {
                imports.insert(module_name.as_str().to_string());
            }
        }
    }

    imports.into_iter().collect()
}

pub fn parse_php_imports(source: &str) -> Vec<String> {
    let pattern = Regex::new(
        r#"\b(?:include|include_once|require|require_once)\s*(?:\(\s*)?["']([^"']+)["']\s*\)?"#,
    )
    .expect("valid php import regex");

    pattern
        .captures_iter(source)
        .filter_map(|capture| capture.get(1).and_then(|value| clean_specifier(value.as_str())))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub fn parse_css_imports(source: &str) -> Vec<String> {
    let pattern = Regex::new(
        r#"(?i)@import\s+(?:url\(\s*(?:["']([^"']+)["']|([^\)\s]+))\s*\)|["']([^"']+)["'])"#,
    )
    .expect("valid css import regex");

    pattern
        .captures_iter(source)
        .filter_map(|capture| {
            capture
                .get(1)
                .or_else(|| capture.get(2))
                .or_else(|| capture.get(3))
                .and_then(|value| clean_specifier(value.as_str()))
        })
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub fn parse_html_imports(source: &str) -> Vec<String> {
    let src_pattern = Regex::new(
        r#"(?i)<(?:script|img|source|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>"#,
    )
    .expect("valid html src regex");
    let href_pattern = Regex::new(r#"(?i)<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>"#)
        .expect("valid html href regex");

    let mut imports = std::collections::BTreeSet::new();
    for pattern in [&src_pattern, &href_pattern] {
        for capture in pattern.captures_iter(source) {
            if let Some(specifier) = capture.get(1).and_then(|value| clean_specifier(value.as_str())) {
                imports.insert(specifier);
            }
        }
    }

    imports.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_html_imports, parse_js_ts_imports};

    #[test]
    fn parses_js_ts_imports_and_ignores_comments_and_strings() {
        let source = r#"
import React from 'react';
// import nope from 'ignore-me';
const text = "require('fake')";
/* export * from 'hidden' */
const z = import("./dynamic");
const y = require('../legacy');
export { x } from "./utils";
import './styles.css';
"#;

        let mut parsed = parse_js_ts_imports(source);
        parsed.sort();

        assert_eq!(
            parsed,
            vec!["../legacy", "./dynamic", "./styles.css", "./utils", "react"]
        );
    }

    #[test]
    fn parses_html_imports() {
        let source = r#"
<html>
  <head>
    <link rel="stylesheet" href="./styles/main.css" />
    <script src="./scripts/app.js?v=1"></script>
  </head>
  <body>
    <img src="assets/logo.png" />
    <iframe src="https://example.com/embed"></iframe>
  </body>
</html>
"#;

        let parsed = parse_html_imports(source);
        assert_eq!(
            parsed,
            vec![
                "./scripts/app.js?v=1".to_string(),
                "./styles/main.css".to_string(),
                "assets/logo.png".to_string(),
                "https://example.com/embed".to_string(),
            ]
        );
    }
}
