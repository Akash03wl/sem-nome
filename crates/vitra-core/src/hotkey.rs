//! Validação e normalização de atalhos globais (formato de acelerador do Tauri).

use std::fmt;

#[derive(Debug, PartialEq)]
pub enum HotkeyError {
    Empty,
    NoModifier,
    NoKey,
    UnknownKey(String),
}

impl fmt::Display for HotkeyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HotkeyError::Empty => write!(f, "Digite um atalho."),
            HotkeyError::NoModifier => write!(f, "Use pelo menos Ctrl, Alt, Shift ou Win."),
            HotkeyError::NoKey => write!(f, "Falta a tecla principal."),
            HotkeyError::UnknownKey(k) => write!(f, "Tecla desconhecida: {k}"),
        }
    }
}

impl std::error::Error for HotkeyError {}

/// Ordem canônica dos modificadores no resultado.
const MODIFIERS: [&str; 4] = ["Ctrl", "Alt", "Shift", "Super"];

fn modifier(part: &str) -> Option<&'static str> {
    match part {
        "ctrl" | "control" => Some("Ctrl"),
        "alt" => Some("Alt"),
        "shift" => Some("Shift"),
        "win" | "super" | "meta" => Some("Super"),
        _ => None,
    }
}

fn key(part: &str) -> Option<String> {
    let upper = part.to_ascii_uppercase();
    let named = match part {
        "space" => Some("Space"),
        "enter" => Some("Enter"),
        "tab" => Some("Tab"),
        "esc" | "escape" => Some("Esc"),
        "backquote" => Some("Backquote"),
        _ => None,
    };
    if let Some(n) = named {
        return Some(n.into());
    }
    let mut chars = upper.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) if c.is_ascii_alphanumeric() => return Some(upper),
        _ => {}
    }
    if let Some(n) = upper.strip_prefix('F').and_then(|d| d.parse::<u8>().ok()) {
        if (1..=24).contains(&n) && !upper[1..].starts_with('0') {
            return Some(upper);
        }
    }
    None
}

/// Valida um atalho digitado pelo usuário e devolve no formato do Tauri,
/// com os modificadores na ordem `Ctrl+Alt+Shift+Super+Tecla`.
pub fn normalize(input: &str) -> Result<String, HotkeyError> {
    if input.trim().is_empty() {
        return Err(HotkeyError::Empty);
    }
    let mut mods: Vec<&'static str> = Vec::new();
    let mut main: Option<&str> = None;
    for raw in input.split('+') {
        let part = raw.trim();
        if part.is_empty() {
            continue;
        }
        match modifier(&part.to_ascii_lowercase()) {
            Some(m) => {
                if !mods.contains(&m) {
                    mods.push(m);
                }
            }
            None => main = Some(part),
        }
    }
    let main = main.ok_or(HotkeyError::NoKey)?;
    let k = key(&main.to_ascii_lowercase()).ok_or_else(|| HotkeyError::UnknownKey(main.into()))?;
    if mods.is_empty() {
        return Err(HotkeyError::NoModifier);
    }
    let mut out: Vec<String> = MODIFIERS
        .iter()
        .filter(|m| mods.contains(m))
        .map(|m| m.to_string())
        .collect();
    out.push(k);
    Ok(out.join("+"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_accepts_default() {
        assert_eq!(normalize("Alt+Space"), Ok("Alt+Space".into()));
    }
    #[test]
    fn normalize_is_case_and_space_insensitive() {
        assert_eq!(normalize(" alt + space "), Ok("Alt+Space".into()));
    }
    #[test]
    fn normalize_orders_modifiers() {
        assert_eq!(normalize("shift+ctrl+k"), Ok("Ctrl+Shift+K".into()));
    }
    #[test]
    fn normalize_maps_win_to_super() {
        assert_eq!(normalize("Win+J"), Ok("Super+J".into()));
    }
    #[test]
    fn normalize_accepts_function_and_digit() {
        assert_eq!(normalize("Ctrl+F5"), Ok("Ctrl+F5".into()));
        assert_eq!(normalize("Alt+1"), Ok("Alt+1".into()));
    }
    #[test]
    fn normalize_rejects_empty() {
        assert_eq!(normalize(""), Err(HotkeyError::Empty));
        assert_eq!(normalize("   "), Err(HotkeyError::Empty));
    }
    #[test]
    fn normalize_rejects_no_modifier() {
        assert_eq!(normalize("a"), Err(HotkeyError::NoModifier));
    }
    #[test]
    fn normalize_rejects_only_modifiers() {
        assert_eq!(normalize("Ctrl+"), Err(HotkeyError::NoKey));
        assert_eq!(normalize("Ctrl+Shift"), Err(HotkeyError::NoKey));
    }
    #[test]
    fn normalize_rejects_unknown_key() {
        assert_eq!(normalize("Ctrl+Banana"), Err(HotkeyError::UnknownKey("Banana".into())));
    }
}
