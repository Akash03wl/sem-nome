//! A biblioteca do dono: itens, favoritos, categorias, recentes e escondidos.
//! Só muda por operações (`LibOp`), aplicadas com `Library::apply`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::path::Path;

use crate::store;

pub const MAX_RECENTS: usize = 8;
const MAX_CATEGORY_NAME: usize = 30;
const RESERVED: [&str; 2] = ["favoritos", "todos"];

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    App,
    Folder,
    File,
    Site,
    /// Grupo de itens que abrem juntos.
    Mode,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub name: String,
    pub kind: ItemKind,
    pub target: String,
    #[serde(default)]
    pub args: String,
    #[serde(default)]
    pub admin: bool,
    /// Só para modos: ids dos itens, na ordem em que abrem.
    #[serde(default)]
    pub members: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Library {
    pub version: u32,
    pub items: Vec<Item>,
    pub favorites: Vec<String>,
    pub categories: Vec<Category>,
    pub recents: Vec<String>,
    pub hidden: Vec<String>,
    /// Quantas vezes cada item foi aberto pelo Vitra (ordena a busca).
    pub launches: BTreeMap<String, u32>,
}

impl Default for Library {
    fn default() -> Self {
        Library {
            version: 1,
            items: vec![],
            favorites: vec![],
            categories: vec![],
            recents: vec![],
            hidden: vec![],
            launches: BTreeMap::new(),
        }
    }
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum LibOp {
    AddItem { item: Item },
    RemoveItem { id: String },
    RenameItem { id: String, name: String },
    SetAdmin { id: String, admin: bool },
    ToggleFavorite { id: String },
    MoveFavorite { id: String, to: usize },
    CreateCategory { name: String },
    RenameCategory { id: String, name: String },
    DeleteCategory { id: String },
    AddToCategory { category: String, id: String },
    RemoveFromCategory { category: String, id: String },
    RecordLaunch { id: String },
    Hide { id: String },
    Unhide { id: String },
    CreateMode { name: String, members: Vec<String> },
    SetModeMembers { id: String, members: Vec<String> },
}

#[derive(Debug, PartialEq)]
pub enum LibError {
    NotFound,
    EmptyName,
    NameTooLong,
    DuplicateName,
    ReservedName,
    ModeInMode,
}

impl fmt::Display for LibError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            LibError::NotFound => "Item não encontrado.",
            LibError::EmptyName => "Dê um nome.",
            LibError::NameTooLong => "Use no máximo 30 letras.",
            LibError::DuplicateName => "Já existe uma categoria com esse nome.",
            LibError::ReservedName => "Esse nome é reservado.",
            LibError::ModeInMode => "Um modo não pode conter outro modo.",
        })
    }
}

impl std::error::Error for LibError {}

impl Library {
    pub fn item(&self, id: &str) -> Option<&Item> {
        self.items.iter().find(|i| i.id == id)
    }

    fn require(&self, id: &str) -> Result<(), LibError> {
        self.item(id).map(|_| ()).ok_or(LibError::NotFound)
    }

    /// Membros de um modo: precisam existir e não podem ser modos.
    fn check_members(&self, members: &[String]) -> Result<(), LibError> {
        for id in members {
            match self.item(id) {
                None => return Err(LibError::NotFound),
                Some(i) if i.kind == ItemKind::Mode => return Err(LibError::ModeInMode),
                _ => {}
            }
        }
        Ok(())
    }

    fn category_mut(&mut self, id: &str) -> Result<&mut Category, LibError> {
        self.categories.iter_mut().find(|c| c.id == id).ok_or(LibError::NotFound)
    }

    /// Valida um nome de categoria; `except` é a própria categoria ao renomear.
    fn check_category_name(&self, name: &str, except: Option<&str>) -> Result<String, LibError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(LibError::EmptyName);
        }
        if name.chars().count() > MAX_CATEGORY_NAME {
            return Err(LibError::NameTooLong);
        }
        let lower = name.to_lowercase();
        if RESERVED.contains(&lower.as_str()) {
            return Err(LibError::ReservedName);
        }
        let taken = self
            .categories
            .iter()
            .any(|c| Some(c.id.as_str()) != except && c.name.to_lowercase() == lower);
        if taken {
            return Err(LibError::DuplicateName);
        }
        Ok(name.to_string())
    }

    fn next_category_id(&self) -> String {
        let max = self
            .categories
            .iter()
            .filter_map(|c| c.id.strip_prefix("cat-")?.parse::<u32>().ok())
            .max()
            .unwrap_or(0);
        format!("cat-{}", max + 1)
    }

    pub fn apply(&mut self, op: LibOp) -> Result<Option<String>, LibError> {
        match op {
            LibOp::AddItem { item } => {
                let id = item.id.clone();
                match self.items.iter_mut().find(|i| i.id == id) {
                    Some(existing) => existing.name = item.name,
                    None => self.items.push(item),
                }
                return Ok(Some(id));
            }
            LibOp::RemoveItem { id } => {
                self.require(&id)?;
                self.items.retain(|i| i.id != id);
                self.favorites.retain(|f| *f != id);
                self.recents.retain(|r| *r != id);
                self.hidden.retain(|h| *h != id);
                self.launches.remove(&id);
                for c in &mut self.categories {
                    c.items.retain(|i| *i != id);
                }
                for m in &mut self.items {
                    m.members.retain(|i| *i != id);
                }
            }
            LibOp::RenameItem { id, name } => {
                let name = name.trim();
                if name.is_empty() {
                    return Err(LibError::EmptyName);
                }
                let item = self.items.iter_mut().find(|i| i.id == id).ok_or(LibError::NotFound)?;
                item.name = name.to_string();
            }
            LibOp::SetAdmin { id, admin } => {
                let item = self.items.iter_mut().find(|i| i.id == id).ok_or(LibError::NotFound)?;
                item.admin = admin;
            }
            LibOp::ToggleFavorite { id } => {
                self.require(&id)?;
                if self.favorites.contains(&id) {
                    self.favorites.retain(|f| *f != id);
                } else {
                    self.favorites.push(id);
                }
            }
            LibOp::MoveFavorite { id, to } => {
                let from = self.favorites.iter().position(|f| *f == id).ok_or(LibError::NotFound)?;
                let id = self.favorites.remove(from);
                let to = to.min(self.favorites.len());
                self.favorites.insert(to, id);
            }
            LibOp::CreateCategory { name } => {
                let name = self.check_category_name(&name, None)?;
                let id = self.next_category_id();
                self.categories.push(Category { id: id.clone(), name, items: vec![] });
                return Ok(Some(id));
            }
            LibOp::RenameCategory { id, name } => {
                if !self.categories.iter().any(|c| c.id == id) {
                    return Err(LibError::NotFound);
                }
                let name = self.check_category_name(&name, Some(&id))?;
                self.category_mut(&id)?.name = name;
            }
            LibOp::DeleteCategory { id } => {
                let before = self.categories.len();
                self.categories.retain(|c| c.id != id);
                if self.categories.len() == before {
                    return Err(LibError::NotFound);
                }
            }
            LibOp::AddToCategory { category, id } => {
                self.require(&id)?;
                let c = self.category_mut(&category)?;
                if !c.items.contains(&id) {
                    c.items.push(id);
                }
            }
            LibOp::RemoveFromCategory { category, id } => {
                self.category_mut(&category)?.items.retain(|i| *i != id);
            }
            LibOp::RecordLaunch { id } => {
                self.require(&id)?;
                *self.launches.entry(id.clone()).or_insert(0) += 1;
                self.recents.retain(|r| *r != id);
                self.recents.insert(0, id);
                self.recents.truncate(MAX_RECENTS);
            }
            LibOp::Hide { id } => {
                if !self.hidden.contains(&id) {
                    self.hidden.push(id);
                }
            }
            LibOp::Unhide { id } => self.hidden.retain(|h| *h != id),
            LibOp::CreateMode { name, members } => {
                let name = name.trim();
                if name.is_empty() {
                    return Err(LibError::EmptyName);
                }
                self.check_members(&members)?;
                let n = self
                    .items
                    .iter()
                    .filter_map(|i| i.id.strip_prefix("mode-")?.parse::<u32>().ok())
                    .max()
                    .unwrap_or(0)
                    + 1;
                let id = format!("mode-{n}");
                self.items.push(Item {
                    id: id.clone(),
                    name: name.to_string(),
                    kind: ItemKind::Mode,
                    target: String::new(),
                    args: String::new(),
                    admin: false,
                    members,
                });
                return Ok(Some(id));
            }
            LibOp::SetModeMembers { id, members } => {
                self.check_members(&members)?;
                let m = self
                    .items
                    .iter_mut()
                    .find(|i| i.id == id && i.kind == ItemKind::Mode)
                    .ok_or(LibError::NotFound)?;
                m.members = members;
            }
        }
        Ok(None)
    }
}

pub fn load_library(path: &Path) -> Library {
    store::load_json(path).unwrap_or_default()
}

pub fn save_library(path: &Path, lib: &Library) -> std::io::Result<()> {
    store::save_json(path, lib)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn app(id: &str) -> Item {
        Item {
            id: id.into(),
            name: id.into(),
            kind: ItemKind::App,
            target: format!("C:\\{id}.exe"),
            args: String::new(),
            admin: false,
            members: vec![],
        }
    }

    fn with(ids: &[&str]) -> Library {
        let mut l = Library::default();
        for id in ids {
            l.apply(LibOp::AddItem { item: app(id) }).unwrap();
        }
        l
    }

    fn fav(l: &mut Library, id: &str) {
        l.apply(LibOp::ToggleFavorite { id: id.into() }).unwrap();
    }

    fn cat(l: &mut Library, name: &str) -> Result<Option<String>, LibError> {
        l.apply(LibOp::CreateCategory { name: name.into() })
    }

    #[test]
    fn apply_add_same_target_twice_keeps_one() {
        let mut l = Library::default();
        assert_eq!(l.apply(LibOp::AddItem { item: app("a") }), Ok(Some("a".into())));
        let renamed = Item { name: "A novo".into(), ..app("a") };
        assert_eq!(l.apply(LibOp::AddItem { item: renamed }), Ok(Some("a".into())));
        assert_eq!(l.items.len(), 1);
        assert_eq!(l.items[0].name, "A novo");
    }

    #[test]
    fn apply_toggle_favorite_adds_then_removes() {
        let mut l = with(&["a"]);
        fav(&mut l, "a");
        assert_eq!(l.favorites, vec!["a"]);
        fav(&mut l, "a");
        assert!(l.favorites.is_empty());
    }

    #[test]
    fn apply_toggle_favorite_unknown_is_not_found() {
        let mut l = Library::default();
        assert_eq!(l.apply(LibOp::ToggleFavorite { id: "x".into() }), Err(LibError::NotFound));
    }

    #[test]
    fn apply_move_favorite_reorders_and_clamps() {
        let mut l = with(&["a", "b", "c"]);
        for id in ["a", "b", "c"] {
            fav(&mut l, id);
        }
        l.apply(LibOp::MoveFavorite { id: "c".into(), to: 0 }).unwrap();
        assert_eq!(l.favorites, vec!["c", "a", "b"]);
        l.apply(LibOp::MoveFavorite { id: "c".into(), to: 99 }).unwrap();
        assert_eq!(l.favorites, vec!["a", "b", "c"]);
    }

    #[test]
    fn apply_remove_cleans_everywhere() {
        let mut l = with(&["a", "b"]);
        fav(&mut l, "a");
        let c = cat(&mut l, "Jogos").unwrap().unwrap();
        l.apply(LibOp::AddToCategory { category: c.clone(), id: "a".into() }).unwrap();
        l.apply(LibOp::RecordLaunch { id: "a".into() }).unwrap();
        l.apply(LibOp::Hide { id: "a".into() }).unwrap();
        l.apply(LibOp::RemoveItem { id: "a".into() }).unwrap();
        assert!(l.item("a").is_none());
        assert!(l.favorites.is_empty());
        assert!(l.categories[0].items.is_empty());
        assert!(l.recents.is_empty());
        assert!(l.hidden.is_empty());
        assert!(l.item("b").is_some());
    }

    #[test]
    fn apply_create_category_assigns_incremental_ids() {
        let mut l = Library::default();
        assert_eq!(cat(&mut l, "Jogos"), Ok(Some("cat-1".into())));
        assert_eq!(cat(&mut l, "Trabalho"), Ok(Some("cat-2".into())));
        l.apply(LibOp::DeleteCategory { id: "cat-1".into() }).unwrap();
        assert_eq!(cat(&mut l, "Pastas"), Ok(Some("cat-3".into())));
    }

    #[test]
    fn apply_create_category_rejects_empty_dup_reserved_long() {
        let mut l = Library::default();
        cat(&mut l, "Jogos").unwrap();
        assert_eq!(cat(&mut l, "   "), Err(LibError::EmptyName));
        assert_eq!(cat(&mut l, " jogos "), Err(LibError::DuplicateName));
        assert_eq!(cat(&mut l, "Favoritos"), Err(LibError::ReservedName));
        assert_eq!(cat(&mut l, "todos"), Err(LibError::ReservedName));
        assert_eq!(cat(&mut l, &"a".repeat(31)), Err(LibError::NameTooLong));
        assert_eq!(l.categories.len(), 1);
    }

    #[test]
    fn apply_rename_category_allows_same_name_other_case() {
        let mut l = Library::default();
        cat(&mut l, "Jogos").unwrap();
        cat(&mut l, "Trabalho").unwrap();
        l.apply(LibOp::RenameCategory { id: "cat-1".into(), name: "JOGOS".into() }).unwrap();
        assert_eq!(l.categories[0].name, "JOGOS");
        assert_eq!(
            l.apply(LibOp::RenameCategory { id: "cat-2".into(), name: "jogos".into() }),
            Err(LibError::DuplicateName)
        );
        assert_eq!(
            l.apply(LibOp::RenameCategory { id: "cat-9".into(), name: "X".into() }),
            Err(LibError::NotFound)
        );
    }

    #[test]
    fn apply_delete_category_keeps_items() {
        let mut l = with(&["a"]);
        cat(&mut l, "Jogos").unwrap();
        l.apply(LibOp::AddToCategory { category: "cat-1".into(), id: "a".into() }).unwrap();
        l.apply(LibOp::DeleteCategory { id: "cat-1".into() }).unwrap();
        assert!(l.categories.is_empty());
        assert!(l.item("a").is_some());
    }

    #[test]
    fn apply_add_to_category_is_unique_and_removable() {
        let mut l = with(&["a"]);
        cat(&mut l, "Jogos").unwrap();
        for _ in 0..2 {
            l.apply(LibOp::AddToCategory { category: "cat-1".into(), id: "a".into() }).unwrap();
        }
        assert_eq!(l.categories[0].items, vec!["a"]);
        l.apply(LibOp::RemoveFromCategory { category: "cat-1".into(), id: "a".into() }).unwrap();
        assert!(l.categories[0].items.is_empty());
        assert_eq!(
            l.apply(LibOp::AddToCategory { category: "cat-1".into(), id: "zz".into() }),
            Err(LibError::NotFound)
        );
    }

    #[test]
    fn apply_record_launch_dedupes_and_caps_at_8() {
        let ids: Vec<String> = (0..10).map(|i| format!("i{i}")).collect();
        let refs: Vec<&str> = ids.iter().map(String::as_str).collect();
        let mut l = with(&refs);
        for id in &ids {
            l.apply(LibOp::RecordLaunch { id: id.clone() }).unwrap();
        }
        l.apply(LibOp::RecordLaunch { id: "i5".into() }).unwrap();
        assert_eq!(l.recents.len(), MAX_RECENTS);
        assert_eq!(l.recents[0], "i5");
        assert_eq!(l.recents.iter().filter(|r| *r == "i5").count(), 1);
    }

    #[test]
    fn apply_rename_and_admin() {
        let mut l = with(&["a"]);
        l.apply(LibOp::RenameItem { id: "a".into(), name: "  Steam ".into() }).unwrap();
        assert_eq!(l.item("a").unwrap().name, "Steam");
        assert_eq!(
            l.apply(LibOp::RenameItem { id: "a".into(), name: " ".into() }),
            Err(LibError::EmptyName)
        );
        l.apply(LibOp::SetAdmin { id: "a".into(), admin: true }).unwrap();
        assert!(l.item("a").unwrap().admin);
    }

    #[test]
    fn apply_hide_and_unhide() {
        let mut l = Library::default();
        l.apply(LibOp::Hide { id: "app-1".into() }).unwrap();
        l.apply(LibOp::Hide { id: "app-1".into() }).unwrap();
        assert_eq!(l.hidden, vec!["app-1"]);
        l.apply(LibOp::Unhide { id: "app-1".into() }).unwrap();
        assert!(l.hidden.is_empty());
    }

    #[test]
    fn libop_deserializes_from_frontend_json() {
        let op: LibOp =
            serde_json::from_str(r#"{"op":"addToCategory","category":"cat-1","id":"a"}"#).unwrap();
        assert_eq!(op, LibOp::AddToCategory { category: "cat-1".into(), id: "a".into() });
        let op: LibOp = serde_json::from_str(
            r#"{"op":"addItem","item":{"id":"a","name":"A","kind":"app","target":"x","args":"","admin":false}}"#,
        )
        .unwrap();
        assert!(matches!(op, LibOp::AddItem { .. }));
        let op: LibOp = serde_json::from_str(r#"{"op":"moveFavorite","id":"a","to":2}"#).unwrap();
        assert_eq!(op, LibOp::MoveFavorite { id: "a".into(), to: 2 });
    }

    #[test]
    fn load_library_corrupt_falls_back_to_bak() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("library.json");
        let l = with(&["a"]);
        fs::write(&p, "{oops").unwrap();
        fs::write(dir.path().join("library.json.bak"), serde_json::to_string(&l).unwrap()).unwrap();
        assert_eq!(load_library(&p), l);
    }

    #[test]
    fn load_library_corrupt_without_bak_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("library.json");
        fs::write(&p, "{oops").unwrap();
        assert_eq!(load_library(&p), Library::default());
    }

    fn mode(l: &mut Library, name: &str, members: &[&str]) -> Result<Option<String>, LibError> {
        l.apply(LibOp::CreateMode {
            name: name.into(),
            members: members.iter().map(|m| m.to_string()).collect(),
        })
    }

    #[test]
    fn record_launch_counts_uses() {
        let mut l = with(&["a"]);
        for _ in 0..3 {
            l.apply(LibOp::RecordLaunch { id: "a".into() }).unwrap();
        }
        assert_eq!(l.launches.get("a"), Some(&3));
    }

    #[test]
    fn create_mode_assigns_id_and_members() {
        let mut l = with(&["a", "b"]);
        assert_eq!(mode(&mut l, " Estudo ", &["b", "a"]), Ok(Some("mode-1".into())));
        assert_eq!(mode(&mut l, "Jogo", &["a"]), Ok(Some("mode-2".into())));
        let m = l.item("mode-1").unwrap();
        assert_eq!(m.name, "Estudo");
        assert_eq!(m.kind, ItemKind::Mode);
        assert_eq!(m.members, vec!["b", "a"]);
    }

    #[test]
    fn create_mode_rejects_empty_name_unknown_and_nested() {
        let mut l = with(&["a"]);
        assert_eq!(mode(&mut l, "  ", &["a"]), Err(LibError::EmptyName));
        assert_eq!(mode(&mut l, "X", &["zz"]), Err(LibError::NotFound));
        mode(&mut l, "Estudo", &["a"]).unwrap();
        assert_eq!(mode(&mut l, "Y", &["mode-1"]), Err(LibError::ModeInMode));
        assert_eq!(l.items.iter().filter(|i| i.kind == ItemKind::Mode).count(), 1);
    }

    #[test]
    fn set_mode_members_replaces() {
        let mut l = with(&["a", "b"]);
        mode(&mut l, "Estudo", &["a"]).unwrap();
        l.apply(LibOp::SetModeMembers { id: "mode-1".into(), members: vec!["b".into()] }).unwrap();
        assert_eq!(l.item("mode-1").unwrap().members, vec!["b"]);
        assert_eq!(
            l.apply(LibOp::SetModeMembers { id: "a".into(), members: vec![] }),
            Err(LibError::NotFound)
        );
    }

    #[test]
    fn remove_item_cleans_mode_members() {
        let mut l = with(&["a", "b"]);
        mode(&mut l, "Estudo", &["a", "b"]).unwrap();
        l.apply(LibOp::RecordLaunch { id: "a".into() }).unwrap();
        l.apply(LibOp::RemoveItem { id: "a".into() }).unwrap();
        assert_eq!(l.item("mode-1").unwrap().members, vec!["b"]);
        assert!(!l.launches.contains_key("a"));
    }

    #[test]
    fn libop_create_mode_from_json() {
        let op: LibOp =
            serde_json::from_str(r#"{"op":"createMode","name":"Estudo","members":["a"]}"#).unwrap();
        assert_eq!(op, LibOp::CreateMode { name: "Estudo".into(), members: vec!["a".into()] });
    }

    #[test]
    fn old_library_without_launches_loads() {
        let json = r#"{"version":1,"items":[{"id":"a","name":"A","kind":"app","target":"x","args":"","admin":false}],"favorites":["a"],"categories":[],"recents":[],"hidden":[]}"#;
        let l: Library = serde_json::from_str(json).unwrap();
        assert!(l.launches.is_empty());
        assert!(l.items[0].members.is_empty());
    }
}
