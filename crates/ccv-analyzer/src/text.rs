pub struct StringLiteral {
    pub value: String,
    pub end: usize,
}

pub fn strip_comments(source: &str) -> String {
    let chars: Vec<char> = source.chars().collect();
    let mut index = 0;
    let mut result = String::new();

    while index < chars.len() {
        let current = chars[index];
        let next = chars.get(index + 1).copied();

        if current == '"' || current == '\'' || current == '`' {
            let literal = read_string_literal(&chars, index);
            for ch in &chars[index..literal.end] {
                result.push(*ch);
            }
            index = literal.end;
            continue;
        }

        if current == '/' && next == Some('/') {
            let line_end = find_line_end(&chars, index + 2);
            for _ in index..line_end {
                result.push(' ');
            }
            index = line_end;
            continue;
        }

        if current == '/' && next == Some('*') {
            result.push(' ');
            result.push(' ');
            let mut cursor = index + 2;
            while cursor < chars.len() {
                if chars[cursor] == '*' && chars.get(cursor + 1).copied() == Some('/') {
                    result.push(' ');
                    result.push(' ');
                    cursor += 2;
                    break;
                }

                result.push(if chars[cursor] == '\n' { '\n' } else { ' ' });
                cursor += 1;
            }
            index = cursor;
            continue;
        }

        result.push(current);
        index += 1;
    }

    result
}

pub fn find_line_end(chars: &[char], start: usize) -> usize {
    let mut cursor = start;
    while cursor < chars.len() && chars[cursor] != '\n' {
        cursor += 1;
    }
    cursor
}

pub fn read_string_literal(chars: &[char], start: usize) -> StringLiteral {
    let quote = chars[start];
    let mut cursor = start + 1;
    let mut value = String::new();

    while cursor < chars.len() {
        let current = chars[cursor];
        if current == '\\' {
            if let Some(next) = chars.get(cursor + 1) {
                value.push(*next);
                cursor += 2;
                continue;
            }
            cursor += 1;
            continue;
        }

        if current == quote {
            return StringLiteral {
                value,
                end: cursor + 1,
            };
        }

        value.push(current);
        cursor += 1;
    }

    StringLiteral {
        value,
        end: chars.len(),
    }
}

pub fn is_identifier_boundary(ch: Option<char>) -> bool {
    match ch {
        Some(value) => !value.is_ascii_alphanumeric() && value != '_' && value != '$',
        None => true,
    }
}

pub fn starts_with_token(chars: &[char], index: usize, token: &str) -> bool {
    let token_chars: Vec<char> = token.chars().collect();
    if index + token_chars.len() > chars.len() {
        return false;
    }

    for (offset, token_char) in token_chars.iter().enumerate() {
        if chars[index + offset] != *token_char {
            return false;
        }
    }

    let before = if index == 0 { None } else { Some(chars[index - 1]) };
    let after = chars.get(index + token_chars.len()).copied();
    is_identifier_boundary(before) && is_identifier_boundary(after)
}

pub fn skip_whitespace_and_comments(chars: &[char], start: usize) -> usize {
    let mut cursor = start;
    while cursor < chars.len() {
        let current = chars[cursor];
        let next = chars.get(cursor + 1).copied();

        if current.is_whitespace() {
            cursor += 1;
            continue;
        }

        if current == '/' && next == Some('/') {
            cursor = find_line_end(chars, cursor + 2);
            continue;
        }

        if current == '/' && next == Some('*') {
            cursor += 2;
            while cursor < chars.len() {
                if chars[cursor] == '*' && chars.get(cursor + 1).copied() == Some('/') {
                    cursor += 2;
                    break;
                }
                cursor += 1;
            }
            continue;
        }

        break;
    }

    cursor
}
