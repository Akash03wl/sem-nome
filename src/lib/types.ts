/** Espelho de `vitra_core::settings::Settings` (serde camelCase). */
export interface Settings {
  version: number;
  hotkey: string;
  accent: string;
  autostart: boolean;
}

export const ACCENTS = ["#9b82ff", "#3fd0c9", "#ff8a4c", "#4c9dff"] as const;

export const ACCENT_NAMES: Record<string, string> = {
  "#9b82ff": "Roxo",
  "#3fd0c9": "Verde-água",
  "#ff8a4c": "Laranja",
  "#4c9dff": "Azul",
};
