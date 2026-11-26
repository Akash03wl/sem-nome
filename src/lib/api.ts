// Único arquivo que fala com o Tauri. Os componentes recebem estas funções por props.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Settings } from "./types";

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
