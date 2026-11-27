//! Leitura e gravação de JSON com backup `.bak` e gravação atômica.

use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub(crate) fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn read<T: DeserializeOwned>(path: &Path) -> Option<T> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

/// Lê `path`; se faltar ou estiver corrompido, tenta `path.bak`.
pub fn load_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    read(path).or_else(|| read(&with_suffix(path, ".bak")))
}

/// Grava de forma atômica (`.tmp` + `rename`). A versão anterior vira `.bak`,
/// mas só se for JSON válido — um arquivo corrompido nunca apaga um backup bom.
pub fn save_json<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let previous_ok = fs::read_to_string(path)
        .ok()
        .is_some_and(|t| serde_json::from_str::<serde_json::Value>(&t).is_ok());
    if previous_ok {
        fs::copy(path, with_suffix(path, ".bak"))?;
    }
    let tmp = with_suffix(path, ".tmp");
    fs::write(&tmp, serde_json::to_string_pretty(value).map_err(io::Error::other)?)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_json_does_not_back_up_corrupt_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.json");
        let bak = dir.path().join("x.json.bak");
        fs::write(&p, "{oops").unwrap();
        fs::write(&bak, "[1]").unwrap();
        save_json(&p, &vec![2]).unwrap();
        assert_eq!(fs::read_to_string(&bak).unwrap(), "[1]");
        assert_eq!(load_json::<Vec<i32>>(&p), Some(vec![2]));
    }

    #[test]
    fn save_json_backs_up_valid_previous() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.json");
        save_json(&p, &vec![1]).unwrap();
        save_json(&p, &vec![2]).unwrap();
        assert_eq!(read::<Vec<i32>>(&with_suffix(&p, ".bak")), Some(vec![1]));
    }
}
