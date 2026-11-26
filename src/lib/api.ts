// Único arquivo que fala com o Tauri. Os componentes recebem estas funções por props.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Discovered, LibOp, Library, Settings } from "./types";

export const getSettings = () => invoke<Settings>("get_settings");

/** Devolve `null` se salvou, ou a mensagem de erro para mostrar ao usuário. */
export async function saveSettings(next: Settings): Promise<string | null> {
  try {
    await invoke<Settings>("save_settings", { next });
    return null;
  } catch (err) {
    return typeof err === "string" ? err : "Não consegui salvar as configurações.";
  }
}

export const hideQuick = () => invoke<void>("hide_quick");
export const openPanel = () => invoke<void>("open_panel");
export const getHotkeyError = () => invoke<string | null>("get_hotkey_error");

export const onQuickShown = (cb: () => void): Promise<UnlistenFn> => listen("quick-shown", () => cb());

export const onSettingsChanged = (cb: (s: Settings) => void): Promise<UnlistenFn> =>
  listen<Settings>("settings-changed", (e) => cb(e.payload));

export function currentWindowLabel(): "quick" | "panel" {
  return getCurrentWindow().label === "quick" ? "quick" : "panel";
}

// ---- Biblioteca (Fase 2) ----

/** Converte o erro de um comando em mensagem para o usuário. */
async function attempt(run: () => Promise<unknown>, fallback: string): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    return typeof err === "string" ? err : fallback;
  }
}

export const getLibrary = () => invoke<Library>("get_library");
export const getDiscovered = () => invoke<Discovered[]>("get_discovered");
export const rediscover = () => invoke<void>("rediscover");

export const applyOp = (op: LibOp) => attempt(() => invoke("library_apply", { op }), "Não consegui salvar.");

export const launchItem = (id: string, admin = false) =>
  attempt(() => invoke("launch_item", { id, admin }), "Não consegui abrir este item.");

export const revealItem = (id: string) =>
  attempt(() => invoke("reveal_item", { id }), "Não consegui abrir o local do arquivo.");

export const getIcon = (id: string) => invoke<string | null>("get_icon", { id }).catch(() => null);

export const addPaths = (paths: string[], category: string | null) =>
  attempt(() => invoke("add_paths", { paths, category }), "Não consegui adicionar.");

export const addSite = (name: string, url: string, category: string | null) =>
  attempt(() => invoke("add_site", { name, url, category }), "Não consegui adicionar o site.");

/** Abre o seletor do Windows e adiciona o que for escolhido. `null` se deu certo ou se cancelou. */
export async function pickAndAdd(category: string | null, folders: boolean): Promise<string | null> {
  const picked = await openDialog({ multiple: true, directory: folders });
  if (!picked) return null;
  const paths = Array.isArray(picked) ? picked : [picked];
  return paths.length ? addPaths(paths, category) : null;
}

export const onLibraryChanged = (cb: (l: Library) => void): Promise<UnlistenFn> =>
  listen<Library>("library-changed", (e) => cb(e.payload));

export const onAppsDiscovered = (cb: (d: Discovered[]) => void): Promise<UnlistenFn> =>
  listen<Discovered[]>("apps-discovered", (e) => cb(e.payload));
