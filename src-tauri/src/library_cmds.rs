//! Comandos da biblioteca de itens (Fase 2).

use std::path::Path;

use base64::Engine;
use tauri::{AppHandle, Emitter, Manager, State};
use vitra_core::items::{
    classify_path, display_name, item_id, launch_error_message, local_path, normalize_url, site_name,
};
use vitra_core::library::{save_library, Item, ItemKind, LibOp, Library};

use crate::win::{self, Discovered};
use crate::AppState;

const FAVORITES: &str = "favoritos";
const ICON_SIZE: i32 = 64;

/// Aplica uma mudança numa cópia, grava e só então troca a biblioteca em memória.
fn mutate<T>(
    app: &AppHandle,
    state: &AppState,
    f: impl FnOnce(&mut Library) -> Result<T, String>,
) -> Result<(T, Library), String> {
    let updated = {
        let mut lib = state.library.lock().unwrap();
        let mut copy = lib.clone();
        let out = f(&mut copy)?;
        save_library(&state.library_path, &copy)
            .map_err(|_| "Não consegui salvar a biblioteca.".to_string())?;
        *lib = copy.clone();
        (out, copy)
    };
    let _ = app.emit("library-changed", updated.1.clone());
    Ok(updated)
}

fn apply(lib: &mut Library, op: LibOp) -> Result<Option<String>, String> {
    lib.apply(op).map_err(|e| e.to_string())
}

/// Procura na biblioteca e, se não achar, nos apps descobertos.
fn find(state: &AppState, id: &str) -> Option<Item> {
    if let Some(item) = state.library.lock().unwrap().item(id) {
        return Some(item.clone());
    }
    state.discovered.lock().unwrap().iter().find(|d| d.id == id).map(|d| Item {
        id: d.id.clone(),
        name: d.name.clone(),
        kind: ItemKind::App,
        target: d.target.clone(),
        args: String::new(),
        admin: false,
    })
}

/// Confere se um caminho local ainda existe, com a mesma mensagem de "não encontrado".
fn ensure_exists(target: &str) -> Result<(), String> {
    match local_path(target) {
        Some(p) if !Path::new(p).exists() => Err(launch_error_message(2).unwrap_or_default()),
        _ => Ok(()),
    }
}

/// Coloca `id` em favoritos (`"favoritos"`) ou numa categoria.
fn place(lib: &mut Library, category: Option<&str>, id: &str) -> Result<(), String> {
    match category {
        Some(FAVORITES) if !lib.favorites.iter().any(|f| f == id) => {
            apply(lib, LibOp::ToggleFavorite { id: id.into() })?;
        }
        Some(FAVORITES) | None => {}
        Some(cat) => {
            apply(lib, LibOp::AddToCategory { category: cat.into(), id: id.into() })?;
        }
    }
    Ok(())
}

/// Descobre os apps em segundo plano e avisa o frontend com `apps-discovered`.
pub fn spawn_discovery(app: AppHandle) {
    std::thread::spawn(move || {
        let list = win::discover();
        *app.state::<AppState>().discovered.lock().unwrap() = list.clone();
        let _ = app.emit("apps-discovered", list);
    });
}

#[tauri::command]
pub fn get_library(state: State<'_, AppState>) -> Library {
    state.library.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_discovered(state: State<'_, AppState>) -> Vec<Discovered> {
    state.discovered.lock().unwrap().clone()
}

#[tauri::command]
pub fn rediscover(app: AppHandle) {
    spawn_discovery(app);
}

#[tauri::command]
pub fn library_apply(app: AppHandle, state: State<'_, AppState>, op: LibOp) -> Result<Library, String> {
    mutate(&app, &state, |lib| apply(lib, op)).map(|(_, lib)| lib)
}

#[tauri::command]
pub async fn launch_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    admin: bool,
) -> Result<(), String> {
    let item = find(&state, &id).ok_or_else(|| launch_error_message(2).unwrap_or_default())?;
    ensure_exists(&item.target)?;
    // Abrir pode esperar o UAC ou um caminho de rede lento: fora das threads assíncronas.
    let (target, args, elevated) = (item.target.clone(), item.args.clone(), admin || item.admin);
    tauri::async_runtime::spawn_blocking(move || win::open(&target, &args, elevated))
        .await
        .map_err(|_| "Não consegui abrir este item.".to_string())??;
    mutate(&app, &state, |lib| {
        if lib.item(&item.id).is_none() {
            apply(lib, LibOp::AddItem { item: item.clone() })?;
        }
        apply(lib, LibOp::RecordLaunch { id: item.id.clone() })
    })?;
    Ok(())
}

#[tauri::command]
pub fn reveal_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let item = find(&state, &id).ok_or_else(|| launch_error_message(2).unwrap_or_default())?;
    if item.kind == ItemKind::Site || item.target.to_lowercase().starts_with("shell:appsfolder") {
        return Err("Não dá para abrir o local deste app.".into());
    }
    ensure_exists(&item.target)?;
    win::reveal(&item.target)
}

/// Ícone do item como data URL PNG (com cache em disco). Sites não têm ícone.
#[tauri::command]
pub async fn get_icon(state: State<'_, AppState>, id: String) -> Result<Option<String>, String> {
    let Some(item) = find(&state, &id) else { return Ok(None) };
    if item.kind == ItemKind::Site {
        return Ok(None);
    }
    let cache = state.icon_dir.join(format!("{id}.png"));
    let bytes = match std::fs::read(&cache) {
        Ok(b) => Some(b),
        Err(_) => {
            // Extrair ícones usa COM/GDI e pode ser lento: fora das threads assíncronas.
            let target = item.target.clone();
            let fresh = tauri::async_runtime::spawn_blocking(move || win::icon_png(&target, ICON_SIZE))
                .await
                .ok()
                .flatten();
            if let Some(b) = &fresh {
                let _ = std::fs::create_dir_all(&state.icon_dir);
                let _ = std::fs::write(&cache, b);
            }
            fresh
        }
    };
    Ok(bytes.map(|b| {
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b))
    }))
}

/// Adiciona caminhos (arrastados ou escolhidos) e devolve os ids, na ordem.
#[tauri::command]
pub fn add_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
    category: Option<String>,
) -> Result<Vec<String>, String> {
    let items: Vec<Item> = paths
        .iter()
        .filter_map(|p| {
            let path = Path::new(p);
            let meta = std::fs::metadata(path).ok()?;
            let kind = classify_path(path, meta.is_dir());
            Some(Item {
                id: item_id(kind, p),
                name: display_name(path),
                kind,
                target: p.clone(),
                args: String::new(),
                admin: false,
            })
        })
        .collect();
    if items.is_empty() {
        return Err("Não encontrei esses arquivos.".into());
    }
    mutate(&app, &state, |lib| {
        let mut ids = Vec::new();
        for item in items {
            let id = apply(lib, LibOp::AddItem { item })?.unwrap_or_default();
            place(lib, category.as_deref(), &id)?;
            ids.push(id);
        }
        Ok(ids)
    })
    .map(|(ids, _)| ids)
}

#[tauri::command]
pub fn add_site(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    url: String,
    category: Option<String>,
) -> Result<String, String> {
    let url = normalize_url(&url).map_err(|e| e.to_string())?;
    let name = match name.trim() {
        "" => site_name(&url),
        n => n.to_string(),
    };
    let item = Item {
        id: item_id(ItemKind::Site, &url),
        name,
        kind: ItemKind::Site,
        target: url,
        args: String::new(),
        admin: false,
    };
    mutate(&app, &state, |lib| {
        let id = apply(lib, LibOp::AddItem { item })?.unwrap_or_default();
        place(lib, category.as_deref(), &id)?;
        Ok(id)
    })
    .map(|(id, _)| id)
}
